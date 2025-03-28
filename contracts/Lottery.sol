// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract Lottery {
    // Constants
    uint256 public constant TICKET_PRICE = 0.25 ether; // 0.25 STT
    uint256 public constant PRIZE_POOL_THRESHOLD = 5 ether; // 5 STT
    uint256 public constant FIRST_PRIZE = 2.5 ether;
    uint256 public constant SECOND_PRIZE = 1.5 ether;
    uint256 public constant THIRD_PRIZE = 1 ether;

    // State variables
    address public owner;
    uint256 public prizePool;
    bool public isRoundActive;
    address[] public participants;
    mapping(uint256 => Winner) public pastWinners;
    uint256 public roundNumber;

    struct Winner {
        address winnerAddress;
        uint256 prizeAmount;
    }

    // Events
    event TicketPurchased(address indexed buyer, uint256 amount);
    event WinnersSelected(address first, address second, address third);

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        isRoundActive = true;
        roundNumber = 1;
    }

    // Buy tickets
    function buyTickets(uint256 numberOfTickets) external payable {
        require(isRoundActive, "Lottery round is not active");
        require(msg.value == numberOfTickets * TICKET_PRICE, "Incorrect payment");

        for (uint256 i = 0; i < numberOfTickets; i++) {
            participants.push(msg.sender);
        }

        prizePool += msg.value;
        emit TicketPurchased(msg.sender, numberOfTickets);

        // Check if prize pool threshold is reached
        if (prizePool >= PRIZE_POOL_THRESHOLD) {
            isRoundActive = false;
        }
    }

    // Select winners
    function selectWinners() external onlyOwner {
        require(!isRoundActive, "Lottery round is still active");
        require(participants.length >= 3, "Not enough participants");

        uint256 firstIndex = getRandomNumber(0, participants.length);
        uint256 secondIndex = getRandomNumber(0, participants.length);
        uint256 thirdIndex = getRandomNumber(0, participants.length);

        // Ensure unique winners
        while (secondIndex == firstIndex) {
            secondIndex = getRandomNumber(0, participants.length);
        }
        while (thirdIndex == firstIndex || thirdIndex == secondIndex) {
            thirdIndex = getRandomNumber(0, participants.length);
        }

        address firstWinner = participants[firstIndex];
        address secondWinner = participants[secondIndex];
        address thirdWinner = participants[thirdIndex];

        // Transfer prizes
        payable(firstWinner).transfer(FIRST_PRIZE);
        payable(secondWinner).transfer(SECOND_PRIZE);
        payable(thirdWinner).transfer(THIRD_PRIZE);

        // Store winners
        pastWinners[roundNumber] = Winner(firstWinner, FIRST_PRIZE);
        pastWinners[roundNumber + 1] = Winner(secondWinner, SECOND_PRIZE);
        pastWinners[roundNumber + 2] = Winner(thirdWinner, THIRD_PRIZE);

        emit WinnersSelected(firstWinner, secondWinner, thirdWinner);

        // Reset for next round
        prizePool = 0;
        delete participants;
        isRoundActive = true;
        roundNumber += 3;
    }

    // Helper function to generate random numbers
    function getRandomNumber(uint256 min, uint256 max) private view returns (uint256) {
        return uint256(keccak256(abi.encodePacked(block.timestamp, block.difficulty, participants.length))) % (max - min) + min;
    }

    // Withdraw remaining funds (only for owner)
    function withdrawFunds() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }
}