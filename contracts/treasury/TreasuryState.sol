// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import {SafeMath} from '@openzeppelin/contracts/math/SafeMath.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import {Address} from '@openzeppelin/contracts/utils/Address.sol';
import {IBasisAsset} from '../interfaces/IBasisAsset.sol';
import {FixedPoint} from '../lib/FixedPoint.sol';
import {Safe112} from '../lib/Safe112.sol';
import {Operator} from '../owner/Operator.sol';
import {Epoch} from '../utils/Epoch.sol';
import {ContractGuard} from '../utils/ContractGuard.sol';
import {ISimpleOracle} from '../interfaces/ISimpleOracle.sol';
import {IUniswapOracle} from '../interfaces/IUniswapOracle.sol';
import {IUniswapV2Router02} from '../interfaces/IUniswapV2Router02.sol';
import {IBoardroom} from '../interfaces/IBoardroom.sol';
import {ISimpleERCFund} from '../interfaces/ISimpleERCFund.sol';

abstract contract TreasuryState is ContractGuard, Epoch {
    using FixedPoint for *;
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint256;
    using Safe112 for uint112;

    /* ========== STATE VARIABLES ========== */

    // ========== FLAGS
    bool public migrated = false;
    bool public initialized = false;

    // ========== CORE
    IERC20 public dai;
    IBasisAsset public cash;
    IBasisAsset public bond;
    IERC20 public share;
    IUniswapV2Router02 public uniswapRouter;
    address uniswapLiquidityPair;

    IBoardroom public arthArthLiquidityMlpBoardroom;
    IBoardroom public arthMahaBoardroom;
    IBoardroom public arthArthBoardroom;
    IBoardroom public mahaArthLiquidityMlpBoardroom;
    IBoardroom public mahaMahaBoardroom;
    IBoardroom public mahaArthBoardroom;

    ISimpleERCFund public ecosystemFund;
    ISimpleERCFund public rainyDayFund;

    // oracles
    IUniswapOracle public bondOracle;
    IUniswapOracle public seigniorageOracle;
    ISimpleOracle public gmuOracle;
    ISimpleOracle public arthMahaOracle;

    // cash price tracking vars
    uint256 public cashTargetPrice = 1e18;

    // these govern how much bond tokens are issued
    uint256 public cashToBondConversionLimit = 0;
    uint256 public accumulatedBonds = 0;

    // this governs how much cash tokens are issued
    uint256 public accumulatedSeigniorage = 0;

    // flag whether we should considerUniswapLiquidity or not.
    bool public considerUniswapLiquidity = false;

    // used to limit how much of the supply is converted into bonds
    uint256 public maxDebtIncreasePerEpoch = 5; // in %

    // the discount given to bond purchasers
    uint256 public bondDiscount = 20; // in %

    // the band beyond which bond purchase or protocol expansion happens.
    uint256 public safetyRegion = 5; // in %

    // at the most how much % of the supply should be increased
    uint256 public maxSupplyIncreasePerEpoch = 10; // in %

    // the ecosystem fund recieves seigniorage before anybody else; this
    // value decides how much of the new seigniorage is sent to this fund.
    uint256 public ecosystemFundAllocationRate = 2; // in %
    uint256 public rainyDayFundAllocationRate = 2; // in %

    // this controls how much of the new seigniorage is given to bond token holders
    // when we are in expansion mode. ideally 90% of new seigniorate is
    // given to bond token holders.
    uint256 public bondSeigniorageRate = 90; // in %

    // we decide how much allocation to give to the boardrooms. there
    // are currently two boardrooms; one for ARTH holders and the other for
    // ARTH liqudity providers
    //
    // TODO: make one for maha holders and one for the various community pools
    uint256 public arthLiquidityMlpAllocationRate = 70; // In %.
    uint256 public arthBoardroomAllocationRate = 20; // IN %.
    uint256 public mahaLiquidityBoardroomAllocationRate = 10; // IN %.

    // stability fee is a special fee charged by the protocol in MAHA tokens
    // whenever a person is going to redeem his/her bonds. the fee is charged
    // basis how much ARTHB is being redeemed.
    //
    // eg: a 1% fee means that while redeeming 100 ARTHB, 1 ARTH worth of MAHA is
    // deducted to pay for stability fees.
    uint256 public stabilityFee = 1; // IN %;

    // amount of maha rewarded per epoch.
    uint256 contractionRewardPerEpoch = 0;

    // wut? algo coin surprise sheeet?
    bool public enableSurprise = false;

    modifier checkMigration {
        require(!migrated, 'Treasury: migrated');
        _;
    }

    modifier checkOperator {
        require(
            cash.operator() == address(this) &&
                bond.operator() == address(this) &&
                arthArthLiquidityMlpBoardroom.operator() == address(this) &&
                arthMahaBoardroom.operator() == address(this) &&
                arthArthBoardroom.operator() == address(this) &&
                mahaArthLiquidityMlpBoardroom.operator() == address(this) &&
                mahaMahaBoardroom.operator() == address(this) &&
                mahaArthBoardroom.operator() == address(this),
            'Treasury: need more permission'
        );
        _;
    }
}
