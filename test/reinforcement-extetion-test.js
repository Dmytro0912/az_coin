// updated 02/04/2022
// author dmytro K
const { expect, assert } = require("chai");
const { constants, utils, BigNumber } = require("ethers");
const { ethers, network } = require("hardhat");
const { getRandomConditionID, getBlockTime, timeShift } = require("../utils/utils");
const dbg = require("debug")("test:reinforcement");

const ONE_WEEK = 604800;

// add total number of outcomes
const TOTALOUTCOMES = 5;

describe("Reinforcement extention test", function () {
  // redeploy
  const reinforcement = constants.WeiPerEther.mul(20000); // 10%
  const marginality = 50000000; // 5%
  let now;

  const pool1 = 5000000;
  const pool2 = 5000000;

  before(async () => {
    [owner, adr1, lpOwner, oracle] = await ethers.getSigners();

    now = await getBlockTime(ethers);

    // test USDT
    Usdt = await ethers.getContractFactory("TestERC20");
    usdt = await Usdt.deploy();
    dbg("usdt deployed to:", usdt.address);
    const mintableAmount = constants.WeiPerEther.mul(8000000);
    await usdt.deployed();
    await usdt.mint(owner.address, mintableAmount);
    await usdt.mint(adr1.address, mintableAmount);

    // nft
    AzuroBet = await ethers.getContractFactory("AzuroBet");
    azurobet = await upgrades.deployProxy(AzuroBet);
    dbg("azurobet deployed to:", azurobet.address);
    await azurobet.deployed();
    dbg(await azurobet.owner(), "-----1", owner.address);

    // lp
    LP = await ethers.getContractFactory("LP");
    lp = await upgrades.deployProxy(LP, [usdt.address, azurobet.address, ONE_WEEK]);
    dbg("lp deployed to:", lp.address);
    await lp.deployed();
    dbg(await lp.owner(), "-----2", owner.address);
    await azurobet.setLP(lp.address);

    // Math
    const MathContract = await ethers.getContractFactory("Math");
    math = await upgrades.deployProxy(MathContract);
    dbg("Math deployed to:", math.address);

    Core = await ethers.getContractFactory("Core");
    core = await upgrades.deployProxy(Core, [reinforcement, oracle.address, marginality, math.address]);
    dbg("core deployed to:", core.address);
    await core.deployed();

    //dbg('balanceOf', await core.connect(adr1).balanceOf(0, owner));

    // setting up
    await core.connect(owner).setLP(lp.address);
    // call setReinforcement function to set values to reinforcements mapping
    // for simplicity, increase reinforcement by 5000 per outcome pair.
    // outcome id have only odd number
    let count = 0;
    let originalValue = BigNumber.from(reinforcement).sub(constants.WeiPerEther.mul(5000));
    while(count < TOTALOUTCOMES) {
        console.log(originalValue);
      await core.setReinforcement((count * 2) + 1, originalValue);
      originalValue = BigNumber.from(originalValue).add(constants.WeiPerEther.mul(5000));
      count++;
    }
    await lp.changeCore(core.address);
    const approveAmount = constants.WeiPerEther.mul(9999999);

    await usdt.approve(lp.address, approveAmount);
    dbg("Approve done ", approveAmount);

    const liquidity = constants.WeiPerEther.mul(2000000);
    await lp.addLiquidity(liquidity);
  });
  it("Should makes conditions with different outcomes and checks if reinforcement is correct", async () => {
    let condID = 1;
    await expect(
        core
          .connect(oracle)
          .createCondition(
            condID,
            [pool2, pool1],
            [1, 2],
            now + 3600,
            ethers.utils.formatBytes32String("ipfs")
          )
      ).to.be.revertedWith("reinforcement is not correct");
    condID++;
    // when values of outcomes array are 3 and 4, reinforcement is correct 
    await 
      core
        .connect(oracle)
        .createCondition(
          condID,
          [pool2, pool1],
          [3, 4],
          now + 3600,
          ethers.utils.formatBytes32String("ipfs")
        )
      let condition = await core.getCondition(condID);
      expect(condition.reinforcement).to.equal(reinforcement);
    condID++;
    await expect(
        core
          .connect(oracle)
          .createCondition(
            condID,
            [pool2, pool1],
            [5, 6],
            now + 3600,
            ethers.utils.formatBytes32String("ipfs")
          )
      ).to.be.revertedWith("reinforcement is not correct");
  });
});
