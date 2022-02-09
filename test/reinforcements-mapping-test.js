// updated 02/07/2022
// author dmytro K
const { expect, assert } = require("chai");
const { constants, utils, BigNumber } = require("ethers");
const { ethers, network } = require("hardhat");
const { getRandomConditionID, getBlockTime, timeShift } = require("../utils/utils");
const {
  BN,           // Big Number support e.g. new BN(1)
  expectEvent,  // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require('@openzeppelin/test-helpers');
const dbg = require("debug")("test:reinforcement");

const ONE_WEEK = 604800;

describe("Reinforcements mapping test", function () {
  // redeploy
  const reinforcement = constants.WeiPerEther.mul(20000); // 10%
  const marginality = 50000000; // 5%
  let now;

  const pool1 = 5000000;
  const pool2 = 5000000;
  const OUTCOMEWIN = 1;
  const OUTCOMELOSE = 2;
  let condID = 0;

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
    // modified at 02/07/2022
    // removed reinforcement parameter
    core = await upgrades.deployProxy(Core, [oracle.address, marginality, math.address]);
    dbg("core deployed to:", core.address);
    await core.deployed();

    //dbg('balanceOf', await core.connect(adr1).balanceOf(0, owner));

    // setting up
    await core.connect(owner).setLP(lp.address);
    await lp.changeCore(core.address);
    const approveAmount = constants.WeiPerEther.mul(9999999);

    await usdt.approve(lp.address, approveAmount);
    dbg("Approve done ", approveAmount);

    const liquidity = constants.WeiPerEther.mul(2000000);
    await lp.addLiquidity(liquidity);
  });
  it("Should add different reinforcement values for each outcomes", async () => {
    // call setReinforcement function to set values to reinforcements mapping
    // for simplicity, make 3 outcomes and increase reinforcement by 5000 per outcome pair.
    // for example, reforcement[1] = 10000, reinforcement[3] = 15000 and reinforcement[5] = 20000
    let count = 0;
    let originalValue = BigNumber.from(reinforcement).sub(constants.WeiPerEther.mul(10000));
    while(count < 3) {
        // console.log(originalValue);
      let tx = await core.setReinforcement([(count * 2) + 1, (count * 2) + 2], originalValue);
      let receipt = await tx.wait();
      let evnt = receipt.events.filter((x) => {
        return x.event == "ReinforcementChanged";
      });
      // check event
      expect(evnt[0].args[0]).to.equal((count * 2) + 1);
      expect(evnt[0].args[1]).to.equal(originalValue);
      // originalValue + 5000
      originalValue = BigNumber.from(originalValue).add(constants.WeiPerEther.mul(5000));
      count++;
    }
  });
  it("Should make conditions with different outcomeId", async () => {
    condID++;
    await 
      core
        .connect(oracle)
        .createCondition(
          condID,
          [pool2, pool1],
          [1, 2],
          now + 3600,
          ethers.utils.formatBytes32String("ipfs")
        );
      let condition = await core.getCondition(condID);
      expect(
        await core.getReinforcementByOutcomes([1, 2])
      ).to.equal(condition.reinforcement);

    condID++;
    await 
      core
        .connect(oracle)
        .createCondition(
          condID,
          [pool2, pool1],
          [3, 4],
          now + 3600,
          ethers.utils.formatBytes32String("ipfs")
        );
      condition = await core.getCondition(condID);
      expect(
        await core.getReinforcementByOutcomes([3, 4])
      ).to.equal(condition.reinforcement);
    condID++;
    await 
      core
        .connect(oracle)
        .createCondition(
          condID,
          [pool2, pool1],
          [5, 6],
          now + 3600,
          ethers.utils.formatBytes32String("ipfs")
        );
      condition = await core.getCondition(condID);
      expect(
        await core.getReinforcementByOutcomes([5, 6])
      ).to.equal(condition.reinforcement);
  });
  it("values of outcomes should be great than 0", async () => {
      await expect(
        core.setReinforcement([0, 1], reinforcement)
      ).to.be.revertedWith("invalid outcomes");
      await expect(
        core.getReinforcementByOutcomes([1, 0])
      ).to.be.revertedWith("invalid outcomes");
  });
});
