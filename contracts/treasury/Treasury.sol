// SPDX-License-Identifier: MIT

pragma solidity ^0.6.10;

import {Math} from '@openzeppelin/contracts/math/Math.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {ICustomERC20} from '../interfaces/ICustomERC20.sol';
import {IUniswapV2Factory} from '../interfaces/IUniswapV2Factory.sol';
import {IUniswapOracle} from '../interfaces/IUniswapOracle.sol';
import {IUniswapV2Router02} from '../interfaces/IUniswapV2Router02.sol';
import {IBoardroom} from '../interfaces/IBoardroom.sol';
import {IBasisAsset} from '../interfaces/IBasisAsset.sol';
import {ISimpleERCFund} from '../interfaces/ISimpleERCFund.sol';
import {Operator} from '../owner/Operator.sol';
import {Epoch} from '../utils/Epoch.sol';
import {ISimpleOracle} from '../interfaces/ISimpleOracle.sol';
import {IUniswapOracle} from '../interfaces/IUniswapOracle.sol';
import {ContractGuard} from '../utils/ContractGuard.sol';
import {TreasuryHelpers} from './TreasuryHelpers.sol';

/**
 * @title ARTH Treasury contract
 * @notice Monetary policy logic to adjust supplies of basis cash assets
 * @author Steven Enamakel & Yash Agrawal. Original code written by Summer Smith & Rick Sanchez
 */
contract Treasury is TreasuryHelpers {
    constructor(
        IERC20 _dai,
        IBasisAsset _cash,
        IBasisAsset _bond,
        IERC20 _share,
        IUniswapOracle _bondOracle,
        ISimpleOracle _arthMahaOracle,
        IUniswapOracle _seigniorageOracle,
        ISimpleOracle _gmuOracle,
        IUniswapV2Router02 _uniswapRouter,
        uint256 _startTime,
        uint256 _period,
        uint256 _startEpoch
    ) public Epoch(_period, _startTime, _startEpoch) {
        // tokens
        dai = _dai;
        cash = _cash;
        bond = _bond;
        share = _share;

        // oracles
        bondOracle = _bondOracle;
        arthMahaOracle = _arthMahaOracle;
        seigniorageOracle = _seigniorageOracle;
        gmuOracle = _gmuOracle;

        // others
        uniswapRouter = _uniswapRouter;
    }

    function initialize() public checkOperator {
        require(!initialized, '!initialized');

        // set accumulatedSeigniorage to the treasury's balance
        accumulatedSeigniorage = IERC20(cash).balanceOf(address(this));

        initialized = true;
        emit Initialized(msg.sender, block.number);
    }

    function buyBonds(uint256 amountInDai, uint256 targetPrice)
        external
        onlyOneBlock
        checkMigration
        checkStartTime
        checkOperator
        updatePrice
        returns (uint256)
    {
        require(amountInDai > 0, 'zero amount');

        // Update the price to latest before using.
        uint256 cash1hPrice = getBondOraclePrice();

        require(cash1hPrice <= targetPrice, 'cash price moved');
        require(
            cash1hPrice <= getBondPurchasePrice(), // price < $0.95
            'cash price not eligible'
        );
        require(cashToBondConversionLimit > 0, 'no more bonds');

        // Find the expected amount recieved when swapping the following
        // tokens on uniswap.
        address[] memory path = new address[](2);
        path[0] = address(dai);
        path[1] = address(cash);

        uint256[] memory amountsOut =
            IUniswapV2Router02(uniswapRouter).getAmountsOut(amountInDai, path);
        uint256 expectedCashAmount = amountsOut[1];

        // 1. Take Dai from the user
        dai.safeTransferFrom(msg.sender, address(this), amountInDai);

        // 2. Approve dai for trade on uniswap
        dai.safeApprove(address(uniswapRouter), amountInDai);

        // 3. Swap dai for ARTH from uniswap and send the ARTH to the sender
        // we send the ARTH back to the sender just in case there is some slippage
        // in our calculations and we end up with more ARTH than what is needed.
        uint256[] memory output =
            IUniswapV2Router02(uniswapRouter).swapExactTokensForTokens(
                amountInDai,
                expectedCashAmount,
                path,
                msg.sender,
                block.timestamp
            );

        // set approve to 0 after transfer
        dai.approve(address(uniswapRouter), 0);

        // we do this to understand how much ARTH was bought back as without this, we
        // could witness a flash loan attack. (given that the minted amount of ARTHB
        // minted is based how much ARTH was received)
        uint256 boughtBackCash = Math.min(output[1], expectedCashAmount);

        // basis the amount of ARTH being bought back; understand how much of it
        // can we convert to bond tokens by looking at the conversion limits
        uint256 cashToConvert =
            Math.min(
                boughtBackCash,
                cashToBondConversionLimit.sub(accumulatedBonds)
            );

        // if all good then mint ARTHB, burn ARTH and update the counters
        require(cashToConvert > 0, 'no more bond limit');

        uint256 bondsToIssue =
            cashToConvert.mul(uint256(100).add(bondDiscount)).div(100);
        accumulatedBonds = accumulatedBonds.add(bondsToIssue);

        // 3. Burn bought ARTH cash and mint bonds at the discounted price.
        // TODO: Set the minting amount according to bond price.
        // TODO: calculate premium basis size of the trade
        IBasisAsset(cash).burnFrom(msg.sender, cashToConvert);
        IBasisAsset(bond).mint(msg.sender, bondsToIssue);

        emit BoughtBonds(msg.sender, amountInDai, cashToConvert, bondsToIssue);

        return bondsToIssue;
    }

    /**
     * Redeeming bonds happen when
     */
    function redeemBonds(uint256 amount)
        external
        onlyOneBlock
        checkMigration
        checkStartTime
        checkOperator
        updatePrice
    {
        require(amount > 0, 'zero amount');

        uint256 cashPrice = _getCashPrice(bondOracle);
        require(
            cashPrice > getBondRedemtionPrice(), // price > $1.00
            'cashPrice less than ceiling'
        );

        require(
            cash.balanceOf(address(this)) >= amount,
            'treasury has not enough budget'
        );

        amount = Math.min(accumulatedSeigniorage, amount);

        // hand over the ARTH directly
        accumulatedSeigniorage = accumulatedSeigniorage.sub(amount);
        IBasisAsset(bond).burnFrom(msg.sender, amount);
        cash.transfer(msg.sender, amount);

        emit RedeemedBonds(msg.sender, amount);
    }

    function allocateSeigniorage()
        external
        onlyOneBlock
        checkMigration
        checkStartTime
        checkEpoch
        checkOperator
    {
        emit AdvanceEpoch(msg.sender);

        _updateCashPrice();
        uint256 cash12hPrice = getSeigniorageOraclePrice();

        // send 300 ARTH reward to the person advancing the epoch to compensate for gas
        IBasisAsset(cash).mint(msg.sender, uint256(300).mul(1e18));

        // update the bond limits
        _updateConversionLimit(cash12hPrice);

        // Check if we are bloew the peg.
        if (cash12hPrice <= cashTargetPrice) {
            // Check if we are below the peg and in contraction or not.
            // Should we use bond purchase price or target price?
            if (cash12hPrice <= getBondPurchasePrice()) {
                uint256 contractionRewardToGive =
                    Math.min(
                        contractionRewardPerEpoch,
                        share.balanceOf(address(this))
                    );

                // Allocate the appropriate contraction reward to boardrooms.
                _allocateToBoardrooms(share, contractionRewardToGive);
            }

            // If contraction rewards are not applicable, then just advance epoch instead revert.
            return;
        }

        if (cash12hPrice <= getExpansionLimitPrice()) {
            // if we are below the ceiling price (or expansion limit price) but
            // above the target price, then we try to pay off all the bond holders
            // as much as possible.

            // calculate how much seigniorage should be minted basis deviation from target price
            uint256 seigniorage = estimateSeignorageToMint(cash12hPrice);

            // if we don't have to pay bond holders anything then simply return.
            if (seigniorage == 0) return;

            // we have to pay them some amount; so mint, distribute and return
            IBasisAsset(cash).mint(address(this), seigniorage);
            emit SeigniorageMinted(seigniorage);

            if (enableSurprise) {
                // surprise!! send 10% to boardooms and 90% to bond holders
                _allocateToBondHolders(seigniorage.mul(90).div(100));
                _allocateToBoardrooms(cash, seigniorage.mul(10).div(100));
            } else {
                _allocateToBondHolders(seigniorage);
            }

            return;
        }

        uint256 seigniorage = estimateSeignorageToMint(cash12hPrice);
        if (seigniorage == 0) return;

        IBasisAsset(cash).mint(address(this), seigniorage);
        emit SeigniorageMinted(seigniorage);

        // send funds to the ecosystem development and raindy fund
        uint256 ecosystemReserve =
            _allocateToFund(
                ecosystemFund,
                ecosystemFundAllocationRate,
                seigniorage
            );

        uint256 raindayReserve =
            _allocateToFund(
                rainyDayFund,
                rainyDayFundAllocationRate,
                seigniorage
            );

        seigniorage = seigniorage.sub(ecosystemReserve).sub(raindayReserve);

        // keep 90% of the funds to bond token holders; and send the remaining to the boardroom
        uint256 allocatedForBondHolders =
            seigniorage.mul(bondSeigniorageRate).div(100);
        uint256 treasuryReserve =
            _allocateToBondHolders(allocatedForBondHolders);
        seigniorage = seigniorage.sub(treasuryReserve);

        // allocate everything else to the boardroom
        _allocateToBoardrooms(cash, seigniorage);
    }

    function refundShares() external onlyOwner {
        share.safeTransfer(msg.sender, share.balanceOf(address(this)));
    }

    event AdvanceEpoch(address indexed from);
}
