// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {PaymentHub} from "../src/PaymentHub.sol";

contract DeployPaymentHub is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address USDC_BASE_MAINNET = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
        address USDC_BASE_SEPOLIA = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
        
        vm.startBroadcast(deployerPrivateKey);
        
        PaymentHub hub = new PaymentHub(USDC_BASE_SEPOLIA, 50); // 0.5% fee
        
        console.log("PaymentHub deployed at:", address(hub));
        
        vm.stopBroadcast();
    }
}
