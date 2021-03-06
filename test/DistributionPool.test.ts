import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { solidity } from 'ethereum-waffle';
import {
  Contract,
  ContractFactory,
  BigNumber,
  utils,
} from 'ethers';
import { Provider } from '@ethersproject/providers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

import { advanceTimeAndBlock, latestBlocktime } from './shared/utilities';


chai.use(solidity);


const DAY = 86400;
const ETH = utils.parseEther('1');
const ZERO = BigNumber.from(0);
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';


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

      await expect(pool.connect(ant).refundToken()).to.revertedWith(
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
      expect(pool.connect(operator).refundToken())
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

      it('should work if amount a user stakes more than once', async () => {
        await dai.connect(ant).approve(pool.address, ETH);
        await dai.connect(whale).approve(pool.address, ETH);

        expect(await pool.connect(ant).stake(ETH));
        expect(await pool.connect(whale).stake(ETH));

        expect(await dai.connect(operator).balanceOf(ant.address)).to.equal(ZERO);
        expect(await dai.connect(operator).balanceOf(whale.address)).to.equal(ZERO);

        await dai.connect(operator).mint(ant.address, ETH);
        await dai.connect(ant).approve(pool.address, ETH);
        expect(await dai.connect(operator).balanceOf(ant.address)).to.equal(ETH);

        expect(await pool.connect(ant).stake(ETH));

        expect(await dai.connect(operator).balanceOf(ant.address)).to.equal(ZERO);
        expect(await dai.connect(operator).balanceOf(whale.address)).to.equal(ZERO);
      })

      it('should not work if amount approved is less than staking', async () => {
        await dai.connect(ant).approve(pool.address, ETH.div(2));
        await dai.connect(whale).approve(pool.address, ETH.div(2));

        const oldAntDaiBalance = await dai.balanceOf(ant.address);
        const oldWhaleDaiBalance = await dai.balanceOf(whale.address);

        await expect(pool.connect(ant).stake(ETH)).to.revertedWith(
          'ERC20: transfer amount exceeds allowance'
        );

        await expect(pool.connect(whale).stake(ETH)).to.revertedWith(
          'ERC20: transfer amount exceeds allowance'
        );

        expect(await dai.connect(operator).balanceOf(ant.address)).to.equal(oldAntDaiBalance);
        expect(await dai.connect(operator).balanceOf(whale.address)).to.equal(oldWhaleDaiBalance);
      })
    });

    describe('#withdraw', () => {
      let beforeStakeAntDaiBalance: any;
      let beforeStakeWhaleDaiBalance: any;

      beforeEach('advance blocktime', async () => {
        beforeStakeAntDaiBalance = await dai.balanceOf(ant.address);
        beforeStakeWhaleDaiBalance = await dai.balanceOf(whale.address);

        await dai.connect(ant).approve(pool.address, ETH);
        await dai.connect(whale).approve(pool.address, ETH);

        await pool.connect(ant).stake(ETH);
        await pool.connect(whale).stake(ETH);
      });

      it('should not work if not a staker', async () => {
        await expect(pool.connect(operator).withdraw(ETH)).to.revertedWith('Pool: cannot withdraw for account which has not done staking');
      });

      it('should not work if not amount is 0', async () => {
        await expect(pool.connect(ant).withdraw(ZERO)).to.revertedWith('Pool: Cannot withdraw 0');
        await expect(pool.connect(whale).withdraw(ZERO)).to.revertedWith('Pool: Cannot withdraw 0');
      });

      it('should work', async () => {
        const oldAntDaiBalance = await dai.balanceOf(ant.address);
        const oldWhaleDaiBalance = await dai.balanceOf(whale.address);

        await pool.connect(ant).withdraw(ETH);
        await pool.connect(whale).withdraw(ETH);

        expect(await dai.connect(operator).balanceOf(ant.address)).to.gt(oldAntDaiBalance);
        expect(await dai.connect(operator).balanceOf(whale.address)).to.gt(oldWhaleDaiBalance);

        expect(await dai.connect(operator).balanceOf(ant.address)).to.equal(beforeStakeAntDaiBalance);
        expect(await dai.connect(operator).balanceOf(whale.address)).to.equal(beforeStakeWhaleDaiBalance);
      })

      it('should not work if user has already withdrawn everything', async () => {
        const oldAntDaiBalance = await dai.balanceOf(ant.address);
        const oldWhaleDaiBalance = await dai.balanceOf(whale.address);

        await pool.connect(ant).withdraw(ETH);
        await pool.connect(whale).withdraw(ETH);

        expect(await dai.connect(operator).balanceOf(ant.address)).to.gt(oldAntDaiBalance);
        expect(await dai.connect(operator).balanceOf(whale.address)).to.gt(oldWhaleDaiBalance);

        expect(await dai.connect(operator).balanceOf(ant.address)).to.equal(beforeStakeAntDaiBalance);
        expect(await dai.connect(operator).balanceOf(whale.address)).to.equal(beforeStakeWhaleDaiBalance);

        await expect(pool.connect(ant).withdraw(ETH)).to.revertedWith('');
      })
    });

    describe('#claimrewards', () => {
      beforeEach('advance blocktime', async () => {
        await dai.connect(operator).mint(ant.address, ETH);
        await dai.connect(operator).mint(whale.address, ETH);

        await dai.connect(ant).approve(pool.address, ETH);
        await dai.connect(whale).approve(pool.address, ETH);

        await pool.connect(operator).modifyRewardRate(10);

        await cash.connect(operator).mint(pool.address, ETH.mul(ETH));

        await pool.connect(ant).stake(ETH);
        await pool.connect(whale).stake(ETH);
      });

      it('should not work if not a staker', async () => {
        await expect(pool.connect(operator).withdraw(ETH)).to.revertedWith('Pool: cannot withdraw for account which has not done staking');
      });

      it('should work', async () => {
        const oldAntDaiBalance = await dai.balanceOf(ant.address);
        const oldWhaleDaiBalance = await dai.balanceOf(whale.address);
        const oldAntCashBalance = await cash.balanceOf(ant.address);
        const oldWhaleCashBalance = await cash.balanceOf(whale.address);

        await pool.connect(ant).getReward();
        await pool.connect(whale).getReward();

        expect(await dai.connect(operator).balanceOf(ant.address)).to.eq(oldAntDaiBalance);
        expect(await dai.connect(operator).balanceOf(whale.address)).to.eq(oldWhaleDaiBalance);

        expect(await cash.connect(operator).balanceOf(ant.address)).to.gt(oldAntCashBalance);
        expect(await cash.connect(operator).balanceOf(whale.address)).to.gt(oldWhaleCashBalance);
      })
    });

    describe('#refunddeposit', () => {
      let beforeStakingAntDaiBalance: any;
      let beforeStakingWhaleDaiBalance: any
      let beforeRefundingOperatorBalance: any;

      beforeEach('advance blocktime', async () => {
        await dai.connect(operator).mint(ant.address, ETH);
        await dai.connect(operator).mint(whale.address, ETH);

        beforeStakingAntDaiBalance = await dai.balanceOf(ant.address);
        beforeStakingWhaleDaiBalance = await dai.balanceOf(whale.address);
        beforeRefundingOperatorBalance = await dai.balanceOf(operator.address);

        await pool.connect(operator).modifyRewardRate(10);

        await dai.connect(ant).approve(pool.address, ETH);
        await dai.connect(whale).approve(pool.address, ETH);

        await pool.connect(ant).stake(ETH);
        await pool.connect(whale).stake(ETH);

        // Wait til start time.
        await advanceTimeAndBlock(
          provider,
          startTime.sub(await latestBlocktime(provider)).toNumber()
        )
      });

      it('should not work if not a owner', async () => {
        await expect(pool.connect(ant).refundToken()).to.revertedWith('Ownable: caller is not the owner');
      });

      it('should work if owner', async () => {
        expect(await dai.connect(operator).balanceOf(ant.address)).to.lt(beforeStakingAntDaiBalance);
        expect(await dai.connect(operator).balanceOf(whale.address)).to.lt(beforeStakingWhaleDaiBalance);

        await pool.connect(operator).refundToken();

        expect(await dai.connect(operator).balanceOf(ant.address)).to.eq(ETH);
        expect(await dai.connect(operator).balanceOf(whale.address)).to.eq(ETH);
        expect(await dai.connect(operator).balanceOf(operator.address)).to.eq(beforeRefundingOperatorBalance.add(ETH.mul(2)));
      })
    });
  });
});
