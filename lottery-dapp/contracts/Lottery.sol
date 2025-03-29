// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @title Lottery Contract
 * @dev A lottery system with multiple winners and round management
 */
contract LotteryContract {
    address public owner;
    uint256 public constant TICKET_PRICE = 0.25 ether;
    uint256 public constant MAX_POOL_SIZE = 5 ether;
    uint256 public constant FIRST_PRIZE = 2.5 ether;
    uint256 public constant SECOND_PRIZE = 1.5 ether;
    uint256 public constant THIRD_PRIZE = 1 ether;
    uint256 public constant MIN_PARTICIPANTS = 3;
    uint256 public constant MAX_TICKETS_PER_WALLET = 2;
    
    struct Round {
        uint256 roundId;
        bool isActive;
        address[] participants;
        mapping(address => uint256) ticketCounts;
        uint256 totalTickets;
        address[] winners;
        bool drawingComplete;
    }
    
    uint256 public currentRoundId;
    mapping(uint256 => Round) private rounds;
    
    event TicketPurchased(address indexed buyer, uint256 amount, uint256 roundId);
    event PrizeAwarded(address indexed winner, uint256 amount, uint256 position, uint256 roundId);
    event RoundReset(uint256 roundId);
    event RoundComplete(uint256 roundId);
    event FundsDeposited(uint256 amount);
    event FundsWithdrawn(uint256 amount);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only the owner can call this function");
        _;
    }
    
    modifier roundActive() {
        require(rounds[currentRoundId].isActive, "Current round is not active");
        _;
    }
    
    constructor() {
        owner = msg.sender;
        // Initialize the first round
        initializeNewRound();
    }
    
    function initializeNewRound() private {
        currentRoundId++;
        Round storage newRound = rounds[currentRoundId];
        newRound.roundId = currentRoundId;
        newRound.isActive = true;
        newRound.totalTickets = 0;
        newRound.drawingComplete = false;
        // Clear previous data
        delete newRound.participants;
        delete newRound.winners;
    }
    
    function buyTickets(uint256 _numberOfTickets) external payable roundActive {
        require(_numberOfTickets > 0, "Must buy at least one ticket");
        require(msg.value == TICKET_PRICE * _numberOfTickets, "Incorrect ETH amount");
        
        Round storage currentRound = rounds[currentRoundId];
        uint256 maxTickets = MAX_POOL_SIZE / TICKET_PRICE;
        
        require(currentRound.totalTickets + _numberOfTickets <= maxTickets, 
                "Not enough space in the pool");
        
        // Check if wallet has reached max ticket limit
        require(currentRound.ticketCounts[msg.sender] + _numberOfTickets <= MAX_TICKETS_PER_WALLET,
                "Exceeded maximum tickets per wallet");
        
        // Update participant data
        if (currentRound.ticketCounts[msg.sender] == 0) {
            currentRound.participants.push(msg.sender);
        }
        
        currentRound.ticketCounts[msg.sender] += _numberOfTickets;
        currentRound.totalTickets += _numberOfTickets;
        
        emit TicketPurchased(msg.sender, _numberOfTickets, currentRoundId);
        
        // Check if the pool is full
        if (currentRound.totalTickets == maxTickets) {
            currentRound.isActive = false;
            emit RoundComplete(currentRoundId);
        }
    }
    
    function drawWinners() external onlyOwner {
        Round storage currentRound = rounds[currentRoundId];
        
        require(!currentRound.isActive, "Round still active");
        require(!currentRound.drawingComplete, "Drawing already complete");
        require(currentRound.participants.length >= MIN_PARTICIPANTS, 
                "Not enough participants");
        
        // Select winners
        selectWinners();
        
        // Distribute prizes
        distributeAwards();
        
        // Mark drawing as complete
        currentRound.drawingComplete = true;
        
        // Initialize new round
        initializeNewRound();
    }
    
    function selectWinners() private {
        Round storage currentRound = rounds[currentRoundId];
        uint256 participantsCount = currentRound.participants.length;
        
        require(participantsCount >= 3, "Cannot draw winners with less than 3 participants");
        
        // Generate three unique winners
        uint256 randomSeed = uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao, currentRoundId)));
        
        address[] memory selectedWinners = new address[](3);
        uint256 selectedCount = 0;
        
        // Create a weighted pool based on ticket counts
        address[] memory weightedPool = createWeightedPool(currentRound);
        uint256 poolSize = weightedPool.length;
        
        while (selectedCount < 3) {
            randomSeed = uint256(keccak256(abi.encodePacked(randomSeed, selectedCount)));
            uint256 winnerIndex = randomSeed % poolSize;
            address potentialWinner = weightedPool[winnerIndex];
            
            // Check if this winner is already selected
            bool isDuplicate = false;
            for (uint256 i = 0; i < selectedCount; i++) {
                if (selectedWinners[i] == potentialWinner) {
                    isDuplicate = true;
                    break;
                }
            }
            
            if (!isDuplicate) {
                selectedWinners[selectedCount] = potentialWinner;
                selectedCount++;
            }
        }
        
        currentRound.winners = selectedWinners;
    }
    
    function createWeightedPool(Round storage round) private view returns (address[] memory) {
        uint256 totalTickets = round.totalTickets;
        address[] memory weightedPool = new address[](totalTickets);
        
        uint256 currentIndex = 0;
        for (uint256 i = 0; i < round.participants.length; i++) {
            address participant = round.participants[i];
            uint256 ticketCount = round.ticketCounts[participant];
            
            for (uint256 j = 0; j < ticketCount; j++) {
                weightedPool[currentIndex] = participant;
                currentIndex++;
            }
        }
        
        return weightedPool;
    }
    
    function distributeAwards() private {
        Round storage currentRound = rounds[currentRoundId];
        require(currentRound.winners.length == 3, "Winners not selected yet");
        
        // Award first prize
        payable(currentRound.winners[0]).transfer(FIRST_PRIZE);
        emit PrizeAwarded(currentRound.winners[0], FIRST_PRIZE, 1, currentRoundId);
        
        // Award second prize
        payable(currentRound.winners[1]).transfer(SECOND_PRIZE);
        emit PrizeAwarded(currentRound.winners[1], SECOND_PRIZE, 2, currentRoundId);
        
        // Award third prize
        payable(currentRound.winners[2]).transfer(THIRD_PRIZE);
        emit PrizeAwarded(currentRound.winners[2], THIRD_PRIZE, 3, currentRoundId);
    }
    
    function resetRound() external onlyOwner {
        Round storage currentRound = rounds[currentRoundId];
        require(!currentRound.drawingComplete, "Round already completed");
        
        // Reset the current round
        currentRound.isActive = false;
        
        // Initialize a new round
        initializeNewRound();
        
        emit RoundReset(currentRoundId);
    }
    
    function depositFunds() external payable onlyOwner {
        emit FundsDeposited(msg.value);
    }
    
    function withdrawFunds(uint256 _amount) external onlyOwner {
        require(_amount <= address(this).balance, "Not enough funds in the contract");
        payable(owner).transfer(_amount);
        emit FundsWithdrawn(_amount);
    }
    
    // View functions
    function getCurrentRound() external view returns (
        uint256 roundId,
        bool isActive,
        uint256 totalTickets,
        uint256 ticketsRemaining,
        uint256 participantsCount,
        bool drawingComplete
    ) {
        Round storage currentRound = rounds[currentRoundId];
        uint256 maxTickets = MAX_POOL_SIZE / TICKET_PRICE;
        
        return (
            currentRound.roundId,
            currentRound.isActive,
            currentRound.totalTickets,
            maxTickets - currentRound.totalTickets,
            currentRound.participants.length,
            currentRound.drawingComplete
        );
    }
    
    function getTicketsForParticipant(address _participant) external view returns (uint256) {
        return rounds[currentRoundId].ticketCounts[_participant];
    }
    
    function getWinners(uint256 _roundId) external view returns (address[] memory) {
        require(_roundId > 0 && _roundId <= currentRoundId, "Invalid round ID");
        return rounds[_roundId].winners;
    }
    
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }
    
    /**
     * @dev Returns all participants and their ticket counts for the current round
     * @return addresses Array of participant addresses
     * @return ticketCounts Array of ticket counts corresponding to addresses
     */
    function getAllParticipantsInfo() external view returns (
        address[] memory addresses,
        uint256[] memory ticketCounts
    ) {
        Round storage currentRound = rounds[currentRoundId];
        uint256 participantsCount = currentRound.participants.length;
        
        addresses = new address[](participantsCount);
        ticketCounts = new uint256[](participantsCount);
        
        for (uint256 i = 0; i < participantsCount; i++) {
            address participant = currentRound.participants[i];
            addresses[i] = participant;
            ticketCounts[i] = currentRound.ticketCounts[participant];
        }
        
        return (addresses, ticketCounts);
    }
    
    receive() external payable {
        emit FundsDeposited(msg.value);
    }
} 