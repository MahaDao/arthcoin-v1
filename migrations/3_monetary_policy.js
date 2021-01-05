
const ARTH = artifacts.require('ARTH');
const ARTHB = artifacts.require('ARTHB');
const MahaToken = artifacts.require('MahaToken');
const IERC20 = artifacts.require('IERC20');
const MockDai = artifacts.require('MockDai');
const DevelopmentFund = artifacts.require('DevelopmentFund');
const BurnbackFund = artifacts.require('BurnbackFund');

const BondRedemtionOracle = artifacts.require('BondRedemtionOracle');
const Treasury = artifacts.require('Treasury');
const ArthLiquidityBoardroom = artifacts.require('ArthLiquidityBoardroom');
const ArthBoardroom = artifacts.require('ArthBoardroom');
const GMUOracle = artifacts.require('GMUOracle');
const SeigniorageOracle = artifacts.require('SeigniorageOracle');

const UniswapV2Factory = artifacts.require('UniswapV2Factory');
const UniswapV2Router02 = artifacts.require('UniswapV2Router02');

const { POOL_START_DATE } = require('./pools');
const knownContracts = require('./known-contracts');


const DAY = 86400;
const HOUR = 60 * 60;


async function approveIfNot(token, owner, spender, amount) {
  const allowance = await token.allowance(owner, spender);

  if (web3.utils.toBN(allowance).gte(web3.utils.toBN(amount))) {
    return;
  }

  await token.approve(spender, amount);
  console.log(` - Approved ${token.symbol ? (await token.symbol()) : token.address}`);
}


function deadline() {
  // 30 minutes.
  return Math.floor(new Date().getTime() / 1000) + 1800;
}


async function migration(deployer, network, accounts) {
  // Set the main account, you'll be using accross all the files for various
  // important activities to your desired address in the .env file.
  accounts[0] = process.env.WALLET_KEY;

  let uniswap, uniswapRouter;

  // Deploy uniswap.
  if (network !== 'mainnet' && network !== 'ropsten') {
    console.log(`Deploying uniswap on ${network} network.`, accounts[0]);
    await deployer.deploy(UniswapV2Factory, accounts[0]);
    uniswap = await UniswapV2Factory.deployed();

    await deployer.deploy(UniswapV2Router02, uniswap.address, accounts[0]);
    uniswapRouter = await UniswapV2Router02.deployed();
  } else {
    uniswap = await UniswapV2Factory.at(knownContracts.UniswapV2Factory[network]);
    uniswapRouter = await UniswapV2Router02.at(knownContracts.UniswapV2Router02[network]);
  }

  // Deploy dai.
  console.log(`Fetching dai on ${network} network.`);

  const dai = network === 'mainnet'
    ? await IERC20.at(knownContracts.DAI[network])
    : await MockDai.deployed();

  // 2. provide liquidity to BAC-DAI and BAS-DAI pair
  // if you don't provide liquidity to BAC-DAI and BAS-DAI pair after step 1 and
  // before step 3, creating Oracle will fail with NO_RESERVES error.
  const unit = web3.utils.toBN(10 ** 18).toString();
  const max = web3.utils.toBN(10 ** 18).muln(10000).toString();

  const cash = await ARTH.deployed();
  const mahaToken = await MahaToken.deployed();
  const bond = await ARTHB.deployed();

  console.log('Approving Uniswap on tokens for liquidity');
  await Promise.all([
    approveIfNot(cash, accounts[0], uniswapRouter.address, max),
    approveIfNot(mahaToken, accounts[0], uniswapRouter.address, max),
    approveIfNot(dai, accounts[0], uniswapRouter.address, max),
  ]);

  if (network !== 'mainnet') {
    // mint 10 maha tokens to self if not on mainnet
    await mahaToken.mint(accounts[0], web3.utils.toBN(2 * 10 * 1e18).toString());
  }

  console.log('\nBalance check');
  console.log(' - Dai account balance:', (await dai.balanceOf(accounts[0])).toString())
  console.log(' - ARTH account balance:', (await cash.balanceOf(accounts[0])).toString())
  console.log(' - MAHA account balance:', (await mahaToken.balanceOf(accounts[0])).toString())
  console.log(' - ARTHB account balance:', (await bond.balanceOf(accounts[0])).toString())

  // WARNING: msg.sender must hold enough DAI to add liquidity to BAC-DAI & BAS-DAI
  // pools otherwise transaction will revert.
  console.log('\nAdding liquidity to pools');
  await uniswapRouter.addLiquidity(
    cash.address,
    dai.address,
    unit,
    unit,
    unit,
    unit,
    accounts[0],
    deadline(),
  );


  console.log(`DAI-ARTH pair address: ${await uniswap.getPair(dai.address, cash.address)}`);
  console.log(`DAI-MAHA pair address: ${await uniswap.getPair(dai.address, mahaToken.address)}`);


  // Deploy funds.
  await deployer.deploy(DevelopmentFund);
  await deployer.deploy(BurnbackFund);

  const startTime = POOL_START_DATE;
  if (network === 'mainnet') {
    startTime += 5 * DAY;
  }

  // Deploy oracle for the pair between bac and dai.
  const bondRedemtionOralce = await deployer.deploy(
    BondRedemtionOracle,
    uniswap.address,
    cash.address, // NOTE YA: I guess bond oracle is for dai - cash pool.
    dai.address,
    2 * HOUR, // In hours for dev deployment purpose.
    startTime
  );

  // Deploy seigniorage oracle.
  // Just to deploy 5_.. migration file.
  await deployer.deploy(
    SeigniorageOracle,
    uniswap.address,
    mahaToken.address,
    dai.address,
    2 * HOUR, // In hours for dev deployment purpose.
    startTime
  );

  // Deploy boardrooms.
  const dai_arth_lpt = await bondRedemtionOralce.pairFor(uniswapFactory.address, ARTH.address, dai.address);
  const arthLiquidityBoardroom = await deployer.deploy(ArthLiquidityBoardroom, cash.address, dai_arth_lpt.address);
  const arthBoardroom = await deployer.deploy(ArthBoardroom, cash.address);

  // Deploy the GMU oracle.
  const gmuOrale = await deployer.deploy(GMUOracle);
  await gmuOrale.setPrice(web3.utils.toBN(1e18).toString()); // set starting price to be 1$

  const treasurey = await deployer.deploy(
    Treasury,
    cash.address,
    ARTHB.address,
    MahaToken.address,
    BondRedemtionOracle.address,
    SeigniorageOracle.address,
    ArthLiquidityBoardroom.address,
    ArthBoardroom.address,
    DevelopmentFund.address,
    BurnbackFund.address,
    GMUOracle.address,
    startTime,
  );

  if (network !== 'mainnet') {
    await treasurey.setEpoch(10 * 60) // 10 min epoch for development purposes
    await arthLiquidityBoardroom.changeLockDuration(5 * 60) // 5 min for liquidity staking locks
    await arthBoardroom.changeLockDuration(5 * 60) // 5 min for staking locks
  } else {
    await treasurey.setEpoch(6 * 60 * 60) // start with a 6 hour epoch
    await arthLiquidityBoardroom.changeLockDuration(86400) // 1 day for staking locks
    await arthBoardroom.changeLockDuration(5 * 86400) // 5 days for staking locks
  }
}


module.exports = migration;