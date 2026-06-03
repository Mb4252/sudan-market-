// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PaymentHub} from "../src/PaymentHub.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockUSDC is IERC20 {
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;
    
    function transfer(address to, uint256 amount) external override returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    
    function approve(address spender, uint256 amount) external override returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    
    function totalSupply() external pure override returns (uint256) { return 0; }
    function name() external pure override returns (string memory) { return "Mock USDC"; }
    function symbol() external pure override returns (string memory) { return "mUSDC"; }
    function decimals() external pure override returns (uint8) { return 6; }
}

contract PaymentHubTest is Test {
    PaymentHub hub;
    MockUSDC usdc;
    address user1 = address(0x123);
    address user2 = address(0x456);
    address owner = address(this);
    
    function setUp() public {
        usdc = new MockUSDC();
        hub = new PaymentHub(address(usdc), 50);
        
        // Mint USDC للمستخدم
        usdc.balanceOf[user1] = 1000 * 1e6;
        vm.prank(user1);
        usdc.approve(address(hub), 1000 * 1e6);
    }
    
    function testSendStablecoin() public {
        bytes32 txHash = keccak256(abi.encodePacked(block.timestamp, user1, user2));
        
        vm.prank(user1);
        (uint256 netAmount, uint256 fee) = hub.sendStablecoin(user2, 100 * 1e6, txHash);
        
        assertEq(netAmount, 99.5 * 1e6);
        assertEq(fee, 0.5 * 1e6);
        assertEq(usdc.balanceOf(user2), 99.5 * 1e6);
    }
    
    function testCannotDoubleSpend() public {
        bytes32 txHash = keccak256(abi.encodePacked(block.timestamp, user1, user2));
        
        vm.prank(user1);
        hub.sendStablecoin(user2, 100 * 1e6, txHash);
        
        vm.prank(user1);
        vm.expectRevert("Duplicate transaction hash");
        hub.sendStablecoin(user2, 100 * 1e6, txHash);
    }
}
