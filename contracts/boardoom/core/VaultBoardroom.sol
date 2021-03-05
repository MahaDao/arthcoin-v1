// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {IERC20} from '@openzeppelin/contracts/contracts/token/ERC20/IERC20.sol';
import {Vault} from './Vault.sol';
import {SafeMath} from '@openzeppelin/contracts/contracts/math/SafeMath.sol';
import {Safe112} from '../../lib/Safe112.sol';
import {ContractGuard} from '../../utils/ContractGuard.sol';
import {Operator} from '../../owner/Operator.sol';
import {IBoardroom} from '../../interfaces/IBoardroom.sol';
import {IBasisAsset} from '../../interfaces/IBasisAsset.sol';
import {IVaultBoardroom} from '../../interfaces/IVaultBoardroom.sol';
import {
    IVestedVaultBoardroom
} from '../../interfaces/IVestedVaultBoardroom.sol';

// import 'hardhat/console.sol';

contract VaultBoardroom is ContractGuard, Operator, IBoardroom {
    using Safe112 for uint112;
    using SafeMath for uint256;

    struct VestedBondingSnapshot {
        // Time when first bonding was made.
        uint256 firstBondedOn;
        // The snapshot index of when first bonded.
        uint256 snapshotIndexWhenFirstBonded;
    }

    struct VestedBoardseat {
        // Pending reward from the previous epochs.
        uint256 rewardPending;
        // Total reward earned in this epoch.
        uint256 rewardEarnedCurrEpoch;
        // Last time reward was claimed(not bound by current epoch).
        uint256 lastClaimedOn;
        // The reward claimed in vesting period of this epoch.
        uint256 rewardClaimedCurrEpoch;
        // Snapshot of boardroom state when last epoch claimed.
        uint256 lastSnapshotIndex;
    }

    // The vault which has state of the stakes.
    Vault public vault;
    IERC20 public token;
    uint256 public currentEpoch = 1;

    IVaultBoardroom prevVaultBoardroom;
    IVestedVaultBoardroom vestedVaultBoardroom;

    BoardSnapshot[] public boardHistory;
    mapping(address => Boardseat) public directors;
    mapping(address => mapping(uint256 => BondingSnapshot))
        public bondingHistory;

    mapping(address => mapping(uint256 => uint256)) directorBalanceForEpoch;
    mapping(address => uint256) directorBalanceLastEpoch;

    modifier directorExists {
        require(
            vault.balanceOf(msg.sender) > 0,
            'Boardroom: The director does not exist'
        );
        _;
    }

    modifier onlyVault {
        require(msg.sender == address(vault), 'Boardroom: not vault');

        _;
    }

    event RewardPaid(address indexed user, uint256 reward);
    event RewardAdded(address indexed user, uint256 reward);

    constructor(IERC20 token_, Vault vault_) {
        token = token_;
        vault = vault_;

        BoardSnapshot memory genesisSnapshot =
            BoardSnapshot({
                number: block.number,
                time: 0,
                rewardReceived: 0,
                rewardPerShare: 0
            });
        boardHistory.push(genesisSnapshot);
    }

    function latestSnapshotIndex() public view returns (uint256) {
        return boardHistory.length.sub(1);
    }

    function getDirector(address who)
        external
        view
        override
        returns (Boardseat memory)
    {
        return directors[who];
    }

    function getBoardhistory(uint256 i)
        public
        view
        returns (BoardSnapshot memory)
    {
        return boardHistory[i];
    }

    function getBondingHistory(address who, uint256 epoch)
        public
        view
        returns (BondingSnapshot memory)
    {
        return bondingHistory[who][epoch];
    }

    function getLatestSnapshot() public view returns (BoardSnapshot memory) {
        return boardHistory[latestSnapshotIndex()];
    }

    function getLastSnapshotIndexOf(address director)
        external
        view
        override
        returns (uint256)
    {
        return directors[director].lastSnapshotIndex;
    }

    function getLastSnapshotOf(address director)
        public
        view
        returns (BoardSnapshot memory)
    {
        return boardHistory[directors[director].lastSnapshotIndex];
    }

    function rewardPerShare() public view returns (uint256) {
        return getLatestSnapshot().rewardPerShare;
    }

    function earned(address director) public view virtual returns (uint256) {
        uint256 latestRPS = getLatestSnapshot().rewardPerShare;
        uint256 storedRPS = getLastSnapshotOf(director).rewardPerShare;

        // If this is 0, that means we are claiming for the first time.
        // That could mean a couple of things:
        //  - 1. We had bonded before this boardroom was live and are claiming in this boardroom for the firstime.
        //  - 2. We have bonded after this boardroom was live and are claiming in this boardroom for the firsttime.
        //  - 3. We had bonded before this boardroom was live and are claiming for the first time ever.
        if (storedRPS == 0) {
            // Get the lastSnapshot user has done any activity from
            // the previous boardrooms(one was vested, other wasn't).
            IVestedVaultBoardroom.Boardseat memory vestedBoardseat =
                vestedVaultBoardroom.directors(director);
            Boardseat memory prevSeat = prevVaultBoardroom.directors(director);

            // If the snapshot index is 0, that means we haven't done any activity
            // in these boardrooms.
            // NOTE: this won't detect the case wherein user has bonded before 1st epoch
            // and not done anything after that as the lastSnapshotIndex would be 0 for
            // this case.
            if (vestedBoardseat.lastSnapshotIndex != 0) storedRPS = 0;
            else if (prevSeat.lastSnapshotIndex != 0) storedRPS = 0;
            else {
                // If we have done any activity in the vault before the first epoch
                // then we claim rewards from all the epoch.
                // NOTE: ideally the activity should be bonding only.
                if (directors[director].isFirstVaultActivityBeforeFirstEpoch) {
                    storedRPS = 0;
                } else {
                    uint256 firstActivityEpoch =
                        directors[director].firstEpochWhenDoingVaultActivity;

                    // Get the epoch at which this activity was done.
                    // claim rewards till that epoch only.
                    storedRPS = boardHistory[firstActivityEpoch].rewardPerShare;
                }
            }
        }

        return
            vault
                .balanceWithoutBonded(director)
                .mul(latestRPS.sub(storedRPS))
                .div(1e18)
                .add(directors[director].rewardEarnedCurrEpoch);
    }

    function claimReward() external virtual directorExists returns (uint256) {
        _updateReward(msg.sender);

        uint256 reward = directors[msg.sender].rewardEarnedCurrEpoch;

        if (reward > 0) {
            directors[msg.sender].rewardEarnedCurrEpoch = 0;
            token.transfer(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }

        return reward;
    }

    function allocateSeigniorage(uint256 amount)
        external
        override
        onlyOneBlock
        onlyOperator
    {
        require(amount > 0, 'Boardroom: Cannot allocate 0');

        uint256 totalSupply = vault.totalBondedSupply();

        // 'Boardroom: Cannot allocate when totalSupply is 0'
        if (totalSupply == 0) return;

        // Create & add new snapshot
        uint256 prevRPS = getLatestSnapshot().rewardPerShare;
        uint256 nextRPS = prevRPS.add(amount.mul(1e18).div(totalSupply));

        BoardSnapshot memory snap =
            BoardSnapshot({
                number: block.number,
                time: block.timestamp,
                rewardReceived: amount,
                rewardPerShare: nextRPS
            });
        boardHistory.push(snap);

        // console.log('allocateSeigniorage totalSupply: %s', totalSupply);
        // console.log('allocateSeigniorage time: %s', block.timestamp);
        // console.log('allocateSeigniorage rewardReceived: %s', amount);
        // console.log('allocateSeigniorage rewardPerShare: %s', nextRPS);

        token.transferFrom(msg.sender, address(this), amount);
        currentEpoch = currentEpoch.add(1);
        emit RewardAdded(msg.sender, amount);
    }

    function updateReward(address director) external virtual onlyVault {
        uint256 latestSnapshotIdx = latestSnapshotIndex();

        // If i'm doing any activity in the vault, before the first epoch
        // then i set this to true.
        // TODO: find a way to know if the activity if bonding and only then
        // set this flag to true.
        if (latestSnapshotIdx == 0) {
            directors[director].isFirstVaultActivityBeforeFirstEpoch = true;
        }

        // If we are doing activity in the vault first time after this bordroom
        // was live then we record the epoch at which we are doing this activity.
        // TODO: find a way to know if the activity if bonding and only then
        // set this variable.
        if (directors[director].firstEpochWhenDoingVaultActivity == 0) {
            directors[director]
                .firstEpochWhenDoingVaultActivity = latestSnapshotIdx;
        }

        _updateReward(director);
    }

    function refundReward() external onlyOwner {
        token.transfer(msg.sender, token.balanceOf(address(this)));
    }

    function setPrevBoardrooms(
        IVestedVaultBoardroom vestedBoardroom,
        IVaultBoardroom boardroom
    ) public onlyOwner {
        prevVaultBoardroom = boardroom;
        vestedVaultBoardroom = vestedBoardroom;
    }

    function _updateReward(address director) internal {
        Boardseat memory seat = directors[director];
        seat.rewardEarnedCurrEpoch = earned(director);
        seat.lastSnapshotIndex = latestSnapshotIndex();
        directors[director] = seat;
    }
}
