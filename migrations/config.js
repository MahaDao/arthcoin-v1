// Provide liquidity to BAC-DAI and BAS-DAI pair if you don't provide 
// liquidity to BAC-DAI and BAS-DAI pair after step 1 and before step 
// 3, creating Oracle will fail with NO_RESERVES error.
const UNIT = web3.utils.toBN(10 ** 18).toString();
const MAX = web3.utils.toBN(10 ** 18).muln(10000).toString();

const DAY = 1 * 24 * 60 * 60;
const HOUR = 1 * 60 * 60;


const POOL_START_DATE = Math.floor(Date.now() / 1000);


const TREASURY_PERIOD = 10 * 60;
const ORACLE_PERIOD = 5 * 60;
const BOND_ORACLE_PERIOD = ORACLE_PERIOD;
const SEIGNIORAGE_ORACLE_PERIOD = ORACLE_PERIOD;

const ORACLE_START_PRICE = web3.utils.toBN(1e18).toString();
const GMU_ORACLE_START_PRICE = ORACLE_START_PRICE;
const MAHAUSD_ORACLE_START_PRICE = ORACLE_START_PRICE;


module.exports = {
  UINT,
  MAX,
  POOL_START_DATE,
  DAY,
  HOUR,
  TREASURY_PERIOD,
  BOND_ORACLE_PERIOD,
  SEIGNIORAGE_ORACLE_PERIOD,
  GMU_ORACLE_START_PRICE,
  MAHAUSD_ORACLE_START_PRICE
};