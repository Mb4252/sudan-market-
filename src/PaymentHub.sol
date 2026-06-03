// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract PaymentHub is ReentrancyGuard, Ownable {
    IERC20 public immutable usdc;
    uint256 public feeBasisPoints; // 50 = 0.5%
    mapping(address => uint256) public userBalances; // داخلي لحفظ الأمان
    mapping(bytes32 => bool) public processedHashes;

    event PaymentSent(
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 fee,
        bytes32 indexed txHash
    );
    
    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event FundsWithdrawn(address indexed treasury, uint256 amount);

    constructor(address _usdc, uint256 _feeBasisPoints) Ownable(msg.sender) {
        require(_usdc != address(0), "Invalid USDC address");
        usdc = IERC20(_usdc);
        feeBasisPoints = _feeBasisPoints; // e.g., 50 = 0.5%
    }

    // إرسال العملات المستقرة مع رسوم ديناميكية
    function sendStablecoin(
        address _to,
        uint256 _amount,
        bytes32 _txHash
    ) external nonReentrant returns (uint256 netAmount, uint256 fee) {
        require(_to != address(0), "Invalid recipient");
        require(_amount > 0, "Amount must be > 0");
        require(_to != msg.sender, "Cannot send to self");
        require(!processedHashes[_txHash], "Duplicate transaction hash");
        
        fee = (_amount * feeBasisPoints) / 10000;
        netAmount = _amount - fee;
        
        // منع تجاوز الرصيد
        require(usdc.transferFrom(msg.sender, address(this), _amount), "TransferFrom failed");
        
        // إرسال المبلغ الصافي للمستلم
        require(usdc.transfer(_to, netAmount), "Transfer to recipient failed");
        
        userBalances[msg.sender] += fee; // تسجيل الرسوم
        processedHashes[_txHash] = true;
        
        emit PaymentSent(msg.sender, _to, netAmount, fee, _txHash);
        return (netAmount, fee);
    }
    
    // سحب الرسوم (للمالك فقط)
    function withdrawFees() external onlyOwner nonReentrant {
        uint256 balance = usdc.balanceOf(address(this));
        require(balance > 0, "No fees to withdraw");
        require(usdc.transfer(owner(), balance), "Withdraw failed");
        emit FundsWithdrawn(owner(), balance);
    }
    
    // تحديث نسبة الرسوم
    function updateFee(uint256 _newFeeBasisPoints) external onlyOwner {
        require(_newFeeBasisPoints <= 500, "Fee too high (max 5%)");
        uint256 oldFee = feeBasisPoints;
        feeBasisPoints = _newFeeBasisPoints;
        emit FeeUpdated(oldFee, _newFeeBasisPoints);
    }
    
    // استرجاع الرصيد المحجوز للمستخدم (للمالك)
    function getUserFeeBalance(address _user) external view returns (uint256) {
        return userBalances[_user];
    }
}
