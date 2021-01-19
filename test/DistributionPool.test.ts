import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { solidity } from 'ethereum-waffle';
import {
  Contract,
  ContractFactory,
  BigNumber,
  utils,
  BigNumberish,
  ContractReceipt,
} from 'ethers';
import { EtherscanProvider, Provider, showThrottleMessage } from '@ethersproject/providers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

import UniswapV2Factory from '@uniswap/v2-core/build/UniswapV2Factory.json';
import UniswapV2Router from '@uniswap/v2-periphery/build/UniswapV2Router02.json';

import { advanceTimeAndBlock } from './shared/utilities';


chai.use(solidity);


const DAY = 86400;
const ETH = utils.parseEther('1');
const ZERO = BigNumber.from(0);
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
const INITIAL_BAC_AMOUNT = utils.parseEther('50000');
const INITIAL_BAB_AMOUNT = utils.parseEther('50000');


async function latestBlocktime(provider: Provider): Promise<number> {
  const { timestamp } = await provider.getBlock('latest');
  return timestamp;
}


function bigmin(a: BigNumber, b: BigNumber): BigNumber {
  return a.lt(b) ? a : b;
}


describe('Distribution pools', () => {
  const { provider } = ethers;

  let operator: SignerWithAddress;
  let ant: SignerWithAddress;
  let whale: SignerWithAddress;

  before('provider & accounts setting', async () => {
    [operator, ant, whale] = await ethers.getSigners();
  });

  // Core.
  let ARTH: ContractFactory;
  let DAI: ContractFactory;
  let POOL: ContractFactory;
  let ARTHB: ContractFactory
  before('fetch contract factories', async () => {
    ARTHB = await ethers.getContractFactory('ARTHB');
    ARTH = await ethers.getContractFactory('ARTH');
    DAI = await ethers.getContractFactory('MockDai');
    POOL = await ethers.getContractFactory('ARTHTOKENPool');

  });

  let cash: Contract;
  let dai: Contract;
  let startTime: BigNumber;
  let pool: Contract;
  let bond: Contract;
  let poolSize: BigNumber = ETH.mul(1000);

  beforeEach('Deploy contracts', async () => {
    cash = await ARTH.connect(operator).deploy();
    dai = await DAI.connect(operator).deploy();
    startTime = BigNumber.from(await latestBlocktime(provider)).add(DAY);
    bond = await ARTHB.connect(operator).deploy();

    pool = await POOL.connect(operator).deploy(
      cash.address,
      dai.address,
      startTime,
      poolSize,
      false,
      'Test pool'
    );
  });

  describe('#setters', () => {
    it('should fail if not the owner', async () => {
      await expect(pool.connect(ant).changeToken(bond.address)).to.revertedWith(
        'Ownable: caller is not the owner'
      );

      await expect(pool.connect(ant).modifyMaxPoolSize(ETH.mul(2))).to.revertedWith(
        'Ownable: caller is not the owner'
      );

      await expect(pool.connect(ant).resetLimitingPoolSize()).to.revertedWith(
        'Ownable: caller is not the owner'
      );

      await expect(pool.connect(ant).setLimitingPoolSize()).to.revertedWith(
        'Ownable: caller is not the owner'
      );

      await expect(pool.connect(ant).modifyStartTime(startTime.add(DAY).add(DAY))).to.revertedWith(
        'Ownable: caller is not the owner'
      );

      await expect(pool.connect(ant).modifyRewardRate(2)).to.revertedWith(
        'Ownable: caller is not the owner'
      );

      await expect(pool.connect(ant).modifyPeriodFinish(startTime.add(DAY).add(DAY).add(DAY))).to.revertedWith(
        'Ownable: caller is not the owner'
      );

      await expect(pool.connect(ant).modifyDuration(5 * 60)).to.revertedWith(
        'Ownable: caller is not the owner'
      );

      await expect(pool.connect(ant).startPool()).to.revertedWith(
        'Ownable: caller is not the owner'
      );

      await expect(pool.connect(ant).endPool()).to.revertedWith(
        'Ownable: caller is not the owner'
      );

      await expect(pool.connect(ant).refundRewardToken()).to.revertedWith(
        'Ownable: caller is not the owner'
      );

      await expect(pool.connect(ant).refundStakedToken()).to.revertedWith(
        'Ownable: caller is not the owner'
      );
    });

    it('should work if tx sender is the owner and params are not proper', async () => {
      await expect(pool.connect(operator).changeToken(ZERO_ADDR)).to.revertedWith(
        'Pool: invalid token'
      );

      await expect(pool.connect(operator).modifyMaxPoolSize(0)).to.revertedWith(
        'Pool: size of pool cannot be 0'
      );

      await expect(pool.connect(operator).modifyStartTime(0)).to.revertedWith(
        'Pool: invalid start time'
      );

      await expect(pool.connect(operator).modifyRewardRate(101)).to.revertedWith(
        'Pool: reward rate has to be less than 100'
      );

      await expect(pool.connect(operator).modifyPeriodFinish(ZERO)).to.revertedWith(
        'Pool: period finish has to be bigger than 0'
      );

      await expect(pool.connect(operator).modifyPeriodFinish(BigNumber.from(await latestBlocktime(provider)).sub(DAY))).to.revertedWith(
        'Pool: cannot finish in the past time'
      );

      await expect(pool.connect(operator).modifyDuration(ZERO)).to.revertedWith(
        'Pool: duration has to be positive'
      );
    });

    it('should work if tx sender is the owner but params are proper', async () => {
      expect(pool.connect(operator).changeToken(bond.address))
      expect(pool.connect(operator).modifyMaxPoolSize(ETH.mul(2)))
      expect(pool.connect(operator).resetLimitingPoolSize())
      expect(pool.connect(operator).setLimitingPoolSize())
      expect(pool.connect(operator).modifyStartTime(startTime.add(DAY).add(DAY)))
      expect(pool.connect(operator).modifyRewardRate(2))
      expect(pool.connect(operator).modifyPeriodFinish(startTime.add(DAY).add(DAY).add(DAY)))
      expect(pool.connect(operator).modifyDuration(5 * 60))
      expect(pool.connect(operator).startPool())
      expect(pool.connect(operator).endPool())
      expect(pool.connect(operator).refundRewardToken())
      expect(pool.connect(operator).refundStakedToken())
    });
  });

  describe('before startTime', () => {
    it('should fail if not started yet', async () => {
      await expect(pool.connect(ant).stake(ETH)).to.revertedWith(
        'Pool: not started'
      );

      await expect(pool.connect(ant).withdraw(ETH)).to.revertedWith(
        'Pool: not started'
      );

      await expect(pool.connect(ant).getReward()).to.revertedWith(
        'Pool: not started'
      );
    });
  });

  describe('after startTime', () => {
    beforeEach('advance blocktime', async () => {
      // Wait til start time.
      await advanceTimeAndBlock(
        provider,
        startTime.sub(await latestBlocktime(provider)).toNumber()
      );

      await dai.connect(operator).mint(ant.address, ETH);
      await dai.connect(operator).mint(whale.address, ETH);
    });

    describe('#stake', () => {
      it('should not work if not amount not approved for staking', async () => {
        const oldDaiBalance = await dai.connect(ant).balanceOf(ant.address);

        await expect(pool.connect(ant).stake(ETH)).to.revertedWith(
          'ERC20: transfer amount exceeds allowance'
        );

        expect(await dai.connect(ant).balanceOf(ant.address)).to.equal(oldDaiBalance);
      });

      it('should work if amount approved for staking', async () => {
        await dai.connect(ant).approve(pool.address, ETH);
        await dai.connect(whale).approve(pool.address, ETH);

        expect(await pool.connect(ant).stake(ETH));
        expect(await pool.connect(whale).stake(ETH));

        expect(await dai.connect(operator).balanceOf(ant.address)).to.equal(ZERO);
        expect(await dai.connect(operator).balanceOf(whale.address)).to.equal(ZERO);
      })
    });

    // describe('#withdraw', () => {
    //   it('should not work if not amount not approved for staking', async () => {
    //     expect(await pool.connect(ant).stake(ETH));
    //   });

    //   it('should work if amount approved for staking', async () => {
    //     await cash.connect(ant).approve(pool.address, ETH);
    //     await cash.connect(whale).approve(pool.address, ETH);

    //     expect(pool.connect(ant).stake(ETH));
    //     expect(pool.connect(ant).stake(ETH));

    //     expect(await cash.connect(operator).balanceOf(ant.address)).to.equal(ZERO);
    //     expect(await cash.connect(operator).balanceOf(whale.address)).to.equal(ZERO);
    //   })
    //});
  });
});
