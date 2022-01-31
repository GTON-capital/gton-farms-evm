
import { ethers } from "hardhat";
import { expect } from "chai";
import { advanceBlockTo } from "./utilities"

describe("BigBanger", function () {
  before(async function () {
    this.signers = await ethers.getSigners()
    this.alice = this.signers[0]
    this.bob = this.signers[1]
    this.carol = this.signers[2]
    this.dev = this.signers[3]
    this.minter = this.signers[4]

    this.BigBanger = await ethers.getContractFactory("BigBanger")
    this.RelictGtonToken = await ethers.getContractFactory("RelictGtonToken")
    this.ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.minter)
  })

  beforeEach(async function () {
    this.relict = await this.RelictGtonToken.deploy()
    await this.relict.deployed()
  })

  it("should set correct state variables", async function () {
    this.banger = await this.BigBanger.deploy(this.relict.address, this.dev.address, "1000", "0", "1000")
    await this.banger.deployed()

    await this.relict.transferOwnership(this.banger.address)

    const relict = await this.banger.relict()
    const devaddr = await this.banger.devaddr()
    const owner = await this.relict.owner()

    expect(relict).to.equal(this.relict.address)
    expect(devaddr).to.equal(this.dev.address)
    expect(owner).to.equal(this.banger.address)
  })

  it("should allow dev and only dev to update dev", async function () {
    this.banger = await this.BigBanger.deploy(this.relict.address, this.dev.address, "1000", "0", "1000")
    await this.banger.deployed()

    expect(await this.banger.devaddr()).to.equal(this.dev.address)

    await expect(this.banger.connect(this.bob).dev(this.bob.address, { from: this.bob.address })).to.be.revertedWith("dev: wut?")

    await this.banger.connect(this.dev).dev(this.bob.address, { from: this.dev.address })

    expect(await this.banger.devaddr()).to.equal(this.bob.address)

    await this.banger.connect(this.bob).dev(this.alice.address, { from: this.bob.address })

    expect(await this.banger.devaddr()).to.equal(this.alice.address)
  })

  context("With ERC/LP token added to the field", function () {
    beforeEach(async function () {
      this.lp = await this.ERC20Mock.deploy("LPToken", "LP", "10000000000")

      await this.lp.transfer(this.alice.address, "1000")

      await this.lp.transfer(this.bob.address, "1000")

      await this.lp.transfer(this.carol.address, "1000")

      this.lp2 = await this.ERC20Mock.deploy("LPToken2", "LP2", "10000000000")

      await this.lp2.transfer(this.alice.address, "1000")

      await this.lp2.transfer(this.bob.address, "1000")

      await this.lp2.transfer(this.carol.address, "1000")
    })

    it("should allow emergency withdraw", async function () {
      // 100 per block farming rate starting at block 100 with bonus until block 1000
      this.banger = await this.BigBanger.deploy(this.relict.address, this.dev.address, "100", "100", "1000")
      await this.banger.deployed()

      await this.banger.add("100", this.lp.address, true)

      await this.lp.connect(this.bob).approve(this.banger.address, "1000")

      await this.banger.connect(this.bob).deposit(0, "100")

      expect(await this.lp.balanceOf(this.bob.address)).to.equal("900")

      await this.banger.connect(this.bob).emergencyWithdraw(0)

      expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000")
    })

    it("should give out relicts only after farming time", async function () {
      // 100 per block farming rate starting at block 100 with bonus until block 1000
      this.banger = await this.BigBanger.deploy(this.relict.address, this.dev.address, "100", "100", "1000")
      await this.banger.deployed()

      await this.relict.transferOwnership(this.banger.address)

      await this.banger.add("100", this.lp.address, true)

      await this.lp.connect(this.bob).approve(this.banger.address, "1000")
      await this.banger.connect(this.bob).deposit(0, "100")
      await advanceBlockTo("89")

      await this.banger.connect(this.bob).deposit(0, "0") // block 90
      expect(await this.relict.balanceOf(this.bob.address)).to.equal("0")
      await advanceBlockTo("94")

      await this.banger.connect(this.bob).deposit(0, "0") // block 95
      expect(await this.relict.balanceOf(this.bob.address)).to.equal("0")
      await advanceBlockTo("99")

      await this.banger.connect(this.bob).deposit(0, "0") // block 100
      expect(await this.relict.balanceOf(this.bob.address)).to.equal("0")
      await advanceBlockTo("100")

      await this.banger.connect(this.bob).deposit(0, "0") // block 101
      expect(await this.relict.balanceOf(this.bob.address)).to.equal("1000")

      await advanceBlockTo("104")
      await this.banger.connect(this.bob).deposit(0, "0") // block 105

      expect(await this.relict.balanceOf(this.bob.address)).to.equal("5000")
      expect(await this.relict.balanceOf(this.dev.address)).to.equal("500")
      expect(await this.relict.totalSupply()).to.equal("5500")
    })

    it("should not distribute relicts if no one deposit", async function () {
      // 100 per block farming rate starting at block 200 with bonus until block 1000
      this.banger = await this.BigBanger.deploy(this.relict.address, this.dev.address, "100", "200", "1000")
      await this.banger.deployed()
      await this.relict.transferOwnership(this.banger.address)
      await this.banger.add("100", this.lp.address, true)
      await this.lp.connect(this.bob).approve(this.banger.address, "1000")
      await advanceBlockTo("199")
      expect(await this.relict.totalSupply()).to.equal("0")
      await advanceBlockTo("204")
      expect(await this.relict.totalSupply()).to.equal("0")
      await advanceBlockTo("209")
      await this.banger.connect(this.bob).deposit(0, "10") // block 210
      expect(await this.relict.totalSupply()).to.equal("0")
      expect(await this.relict.balanceOf(this.bob.address)).to.equal("0")
      expect(await this.relict.balanceOf(this.dev.address)).to.equal("0")
      expect(await this.lp.balanceOf(this.bob.address)).to.equal("990")
      await advanceBlockTo("219")
      await this.banger.connect(this.bob).withdraw(0, "10") // block 220
      expect(await this.relict.totalSupply()).to.equal("11000")
      expect(await this.relict.balanceOf(this.bob.address)).to.equal("10000")
      expect(await this.relict.balanceOf(this.dev.address)).to.equal("1000")
      expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000")
    })

    it("should distribute relicts properly for each staker", async function () {
      // 100 per block farming rate starting at block 300 with bonus until block 1000
      this.banger = await this.BigBanger.deploy(this.relict.address, this.dev.address, "100", "300", "1000")
      await this.banger.deployed()
      await this.relict.transferOwnership(this.banger.address)
      await this.banger.add("100", this.lp.address, true)
      await this.lp.connect(this.alice).approve(this.banger.address, "1000", {
        from: this.alice.address,
      })
      await this.lp.connect(this.bob).approve(this.banger.address, "1000", {
        from: this.bob.address,
      })
      await this.lp.connect(this.carol).approve(this.banger.address, "1000", {
        from: this.carol.address,
      })
      // Alice deposits 10 LPs at block 310
      await advanceBlockTo("309")
      await this.banger.connect(this.alice).deposit(0, "10", { from: this.alice.address })
      // Bob deposits 20 LPs at block 314
      await advanceBlockTo("313")
      await this.banger.connect(this.bob).deposit(0, "20", { from: this.bob.address })
      // Carol deposits 30 LPs at block 318
      await advanceBlockTo("317")
      await this.banger.connect(this.carol).deposit(0, "30", { from: this.carol.address })
      // Alice deposits 10 more LPs at block 320. At this point:
      //   Alice should have: 4*1000 + 4*1/3*1000 + 2*1/6*1000 = 5666
      //   BigBanger should have the remaining: 10000 - 5666 = 4334
      await advanceBlockTo("319")
      await this.banger.connect(this.alice).deposit(0, "10", { from: this.alice.address })
      expect(await this.relict.totalSupply()).to.equal("11000")
      expect(await this.relict.balanceOf(this.alice.address)).to.equal("5666")
      expect(await this.relict.balanceOf(this.bob.address)).to.equal("0")
      expect(await this.relict.balanceOf(this.carol.address)).to.equal("0")
      expect(await this.relict.balanceOf(this.banger.address)).to.equal("4334")
      expect(await this.relict.balanceOf(this.dev.address)).to.equal("1000")
      // Bob withdraws 5 LPs at block 330. At this point:
      //   Bob should have: 4*2/3*1000 + 2*2/6*1000 + 10*2/7*1000 = 6190
      await advanceBlockTo("329")
      await this.banger.connect(this.bob).withdraw(0, "5", { from: this.bob.address })
      expect(await this.relict.totalSupply()).to.equal("22000")
      expect(await this.relict.balanceOf(this.alice.address)).to.equal("5666")
      expect(await this.relict.balanceOf(this.bob.address)).to.equal("6190")
      expect(await this.relict.balanceOf(this.carol.address)).to.equal("0")
      expect(await this.relict.balanceOf(this.banger.address)).to.equal("8144")
      expect(await this.relict.balanceOf(this.dev.address)).to.equal("2000")
      // Alice withdraws 20 LPs at block 340.
      // Bob withdraws 15 LPs at block 350.
      // Carol withdraws 30 LPs at block 360.
      await advanceBlockTo("339")
      await this.banger.connect(this.alice).withdraw(0, "20", { from: this.alice.address })
      await advanceBlockTo("349")
      await this.banger.connect(this.bob).withdraw(0, "15", { from: this.bob.address })
      await advanceBlockTo("359")
      await this.banger.connect(this.carol).withdraw(0, "30", { from: this.carol.address })
      expect(await this.relict.totalSupply()).to.equal("55000")
      expect(await this.relict.balanceOf(this.dev.address)).to.equal("5000")
      // Alice should have: 5666 + 10*2/7*1000 + 10*2/6.5*1000 = 11600
      expect(await this.relict.balanceOf(this.alice.address)).to.equal("11600")
      // Bob should have: 6190 + 10*1.5/6.5 * 1000 + 10*1.5/4.5*1000 = 11831
      expect(await this.relict.balanceOf(this.bob.address)).to.equal("11831")
      // Carol should have: 2*3/6*1000 + 10*3/7*1000 + 10*3/6.5*1000 + 10*3/4.5*1000 + 10*1000 = 26568
      expect(await this.relict.balanceOf(this.carol.address)).to.equal("26568")
      // All of them should have 1000 LPs back.
      expect(await this.lp.balanceOf(this.alice.address)).to.equal("1000")
      expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000")
      expect(await this.lp.balanceOf(this.carol.address)).to.equal("1000")
    })

    it("should give proper relicts allocation to each pool", async function () {
      // 100 per block farming rate starting at block 400 with bonus until block 1000
      this.banger = await this.BigBanger.deploy(this.relict.address, this.dev.address, "100", "400", "1000")
      await this.relict.transferOwnership(this.banger.address)
      await this.lp.connect(this.alice).approve(this.banger.address, "1000", { from: this.alice.address })
      await this.lp2.connect(this.bob).approve(this.banger.address, "1000", { from: this.bob.address })
      // Add first LP to the pool with allocation 1
      await this.banger.add("10", this.lp.address, true)
      // Alice deposits 10 LPs at block 410
      await advanceBlockTo("409")
      await this.banger.connect(this.alice).deposit(0, "10", { from: this.alice.address })
      // Add LP2 to the pool with allocation 2 at block 420
      await advanceBlockTo("419")
      await this.banger.add("20", this.lp2.address, true)
      // Alice should have 10*1000 pending reward
      expect(await this.banger.pendingRelict(0, this.alice.address)).to.equal("10000")
      // Bob deposits 10 LP2s at block 425
      await advanceBlockTo("424")
      await this.banger.connect(this.bob).deposit(1, "5", { from: this.bob.address })
      // Alice should have 10000 + 5*1/3*1000 = 11666 pending reward
      expect(await this.banger.pendingRelict(0, this.alice.address)).to.equal("11666")
      await advanceBlockTo("430")
      // At block 430. Bob should get 5*2/3*1000 = 3333. Alice should get ~1666 more.
      expect(await this.banger.pendingRelict(0, this.alice.address)).to.equal("13333")
      expect(await this.banger.pendingRelict(1, this.bob.address)).to.equal("3333")
    })

    it("should stop giving bonus relicts after the bonus period ends", async function () {
      // 100 per block farming rate starting at block 500 with bonus until block 600
      this.banger = await this.BigBanger.deploy(this.relict.address, this.dev.address, "100", "500", "600")
      await this.relict.transferOwnership(this.banger.address)
      await this.lp.connect(this.alice).approve(this.banger.address, "1000", { from: this.alice.address })
      await this.banger.add("1", this.lp.address, true)
      // Alice deposits 10 LPs at block 590
      await advanceBlockTo("589")
      await this.banger.connect(this.alice).deposit(0, "10", { from: this.alice.address })
      // At block 605, she should have 1000*10 + 100*5 = 10500 pending.
      await advanceBlockTo("605")
      expect(await this.banger.pendingRelict(0, this.alice.address)).to.equal("10500")
      // At block 606, Alice withdraws all pending rewards and should get 10600.
      await this.banger.connect(this.alice).deposit(0, "0", { from: this.alice.address })
      expect(await this.banger.pendingRelict(0, this.alice.address)).to.equal("0")
      expect(await this.relict.balanceOf(this.alice.address)).to.equal("10600")
    })
  })
})
