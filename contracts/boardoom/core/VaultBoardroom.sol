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

contract VaultBoardroom is ContractGuard, Operator, IBoardroom {
    using Safe112 for uint112;
    using SafeMath for uint256;

    /**
     * Data structures.
     */

    struct Boardseat {
        // Pending reward from the previous epochs.
        uint256 rewardPending;
        // Total reward earned in this epoch.
        uint256 rewardEarned;
        // Last time reward was claimed(not bound by current epoch).
        uint256 lastClaimedOn;
        // Snapshot of boardroom state when last claimed(not bound by current epoch).
        uint256 lastSnapshotIndex;
    }

    struct BoardSnapshot {
        // Block number when recording a snapshot.
        uint256 number;
        // Block timestamp when recording a snapshot.
        uint256 time;
        // Amount of funds received.
        uint256 rewardReceived;
        // Equivalent amount per share staked.
        uint256 rewardPerShare;
    }

    /**
     * State variables.
     */

    // The vault which has state of the stakes.
    Vault public vault;
    IERC20 public token;

    BoardSnapshot[] internal boardHistory;
    mapping(address => Boardseat) internal directors;

    /**
     * Modifier.
     */
    modifier directorExists {
        require(
            vault.balanceOf(msg.sender) > 0,
            'Boardroom: The director does not exist'
        );
        _;
    }

    /**
     * Events.
     */

    event RewardPaid(address indexed user, uint256 reward);
    event RewardAdded(address indexed user, uint256 reward);

    /**
     * Constructor.
     */
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

    /**
     * Views/Getters.
     */

    function latestSnapshotIndex() public view returns (uint256) {
        return boardHistory.length.sub(1);
    }

    function getLatestSnapshot() internal view returns (BoardSnapshot memory) {
        return boardHistory[latestSnapshotIndex()];
    }

    function getLastSnapshotIndexOf(address director)
        public
        view
        returns (uint256)
    {
        return directors[director].lastSnapshotIndex;
    }

    function getLastSnapshotOf(address director)
        internal
        view
        returns (BoardSnapshot memory)
    {
        return boardHistory[getLastSnapshotIndexOf(director)];
    }

    function rewardPerShare() public view returns (uint256) {
        return getLatestSnapshot().rewardPerShare;
    }

    function earned(address director) public view virtual returns (uint256) {
        uint256 latestRPS = getLatestSnapshot().rewardPerShare;
        uint256 storedRPS = getLastSnapshotOf(director).rewardPerShare;

        return
            vault
                .balanceWithoutBonded(director)
                .mul(latestRPS.sub(storedRPS))
                .div(1e18)
                .add(directors[director].rewardEarned);
    }

    function claimReward() external virtual {
        if (msg.sender != address(0)) {
            Boardseat memory seat = directors[msg.sender];
            seat.rewardEarned = earned(msg.sender);
            seat.lastSnapshotIndex = latestSnapshotIndex();
            directors[msg.sender] = seat;
        }

        uint256 reward = directors[msg.sender].rewardEarned;

        if (reward > 0) {
            directors[msg.sender].rewardEarned = 0;
            token.transfer(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    function allocateSeigniorage(uint256 amount)
        external
        override
        onlyOneBlock
        onlyOperator
    {
        require(amount > 0, 'Boardroom: Cannot allocate 0');

        uint256 totalSupply = vault.totalSupply();

        // 'Boardroom: Cannot allocate when totalSupply is 0'
        if (totalSupply == 0) return;

        // Create & add new snapshot
        uint256 prevRPS = getLatestSnapshot().rewardPerShare;
        uint256 nextRPS = prevRPS.add(amount.mul(1e18).div(totalSupply));

        BoardSnapshot memory newSnapshot =
            BoardSnapshot({
                number: block.number,
                time: block.timestamp,
                rewardReceived: amount,
                rewardPerShare: nextRPS
            });
        boardHistory.push(newSnapshot);

        token.transferFrom(msg.sender, address(this), amount);
        emit RewardAdded(msg.sender, amount);
    }

    function refundReward() external onlyOwner {
        token.transfer(msg.sender, token.balanceOf(address(this)));
    }
}