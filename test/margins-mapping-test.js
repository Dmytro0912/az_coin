// updated 02/07/2022
// author dmytro K
const { expect, assert } = require("chai");
const { constants, utils, BigNumber } = require("ethers");
const { ethers, network } = require("hardhat");
const { getRandomConditionID, getBlockTime, timeShift } = require("../utils/utils");
const dbg = require("debug")("test:reinforcement");

const ONE_WEEK = 604800;

describe("Margins mapping test", function () {
  // redeploy
  const reinforcement = constants.WeiPerEther.mul(20000); // 10%
  const marginality = 50000000; // 5%
  let now;

  const pool1 = 5000000;
  const pool2 = 5000000;
  const OUTCOMEWIN = 1;
  const OUTCOMELOSE = 2;
  let condID = 0;
  let outcomes = [[1, 2], [3, 4], [29, 40]];
  let margins = [10, 7.5, 5];
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
    core = await upgrades.deployProxy(Core, [oracle.address, math.address]);
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
    
    // updated 02/08/2022
    // add setReinforcement function
    await core.setReinforcement([OUTCOMEWIN, OUTCOMELOSE], reinforcement);
  });
  it("Should add different margin values for each outcomes", async () => {
    // call setMargin function to set values to margins mapping
    // for simplicity, make 3 pair of outcomes and their margin .
   
    for(let i = 0; i < outcomes.length; i++)
    {

      margins[i] = margins[i] * (10 ** 7);
     await core.setReinforcement(outcomes[i], reinforcement);
     let tx = await core.setMargin(outcomes[i], margins[i]);
     let receipt = await tx.wait();
     let evnt = receipt.events.filter((x) => {
       return x.event == "MarginChanged";
     });
     expect(evnt[0].args[0][0]).to.equal(outcomes[i][0]);
     expect(evnt[0].args[0][1]).to.equal(outcomes[i][1]);
     expect(evnt[0].args[1]).to.equal(margins[i]);
     
     //console.log("outcomes", outcomes[i], " = ", evnt[0].args[1]);

    }

    
  });
  it("Should make conditions with different outcomeId", async () => {
    for(let i = 0; i < outcomes.length; i++){
    condID++;
    await 
      core
        .connect(oracle)
        .createCondition(
          condID,
          [pool2, pool1],
          outcomes[i],
          now + 3600,
          ethers.utils.formatBytes32String("ipfs")
        );
      let condition = await core.getCondition(condID);
      expect(
        await core.getMarginByOutcomes(outcomes[i])
      ).to.equal(condition.margin);
    }
  });
  it("values of outcomes should be great than 0", async () => {
      await expect(
        core.setMargin([0, 1], marginality)
      ).to.be.revertedWith("invalid outcomes");
      await expect(
        core.getMarginByOutcomes([1, 0])
      ).to.be.revertedWith("invalid outcomes");
  });
});
