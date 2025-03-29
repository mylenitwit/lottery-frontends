import React, { useEffect, useState, useCallback } from 'react';
import { connectWallet, disconnectWallet, getContract } from './utils/contract';
import { ethers } from 'ethers';
import './custom.css';

// Constant for maximum tickets
const MAX_TICKETS_PER_WALLET = 2;

const App = () => {
  const [connected, setConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [buyingTickets, setBuyingTickets] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [ticketCount, setTicketCount] = useState(1);
  const [networkName, setNetworkName] = useState('');
  const [transactionSuccess, setTransactionSuccess] = useState(false);
  const [switchingNetwork, setSwitchingNetwork] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [contractBalance, setContractBalance] = useState(null);
  const [currentRound, setCurrentRound] = useState({
    roundId: 0,
    isActive: false,
    totalTickets: 0,
    ticketsRemaining: 0,
    participantsCount: 0,
    drawingComplete: false
  });
  const [userTickets, setUserTickets] = useState(0);
  const [ticketPrice, setTicketPrice] = useState('0.25');
  const [winners, setWinners] = useState([]);
  
  const handleConnectWallet = async () => {
    try {
      setLoading(true);
      setSwitchingNetwork(true);
      const address = await connectWallet();
      setWalletAddress(address);
      setConnected(true);
      setErrorMessage('');
      setNetworkName('Somnia Testnet');
      
      // Check if this is the owner wallet
      checkOwner(address);
    } catch (error) {
      console.error('Error connecting wallet:', error);
      
      // User-friendly error messages
      if (error.code === 4001 || 
          (error.message && (error.message.includes('user rejected') || error.message.includes('user denied')))) {
        setErrorMessage('Wallet connection rejected by user');
      } else if (error.message && error.message.includes('Already processing')) {
        setErrorMessage('Already processing a wallet request');
      } else if (!window.ethereum) {
        setErrorMessage('MetaMask is not installed. Please install MetaMask');
      } else if (error.message && error.message.includes('Somnia')) {
        // Network switch errors are shown specifically
        setErrorMessage(error.message);
      } else if (error.message && error.message.includes('network')) {
        setErrorMessage('Network change failed. Please try again');
      } else {
        setErrorMessage('Wallet connection failed. Please try again');
      }
    } finally {
      setLoading(false);
      setSwitchingNetwork(false);
    }
  };

  const checkOwner = async (userAddress) => {
    try {
      const contract = getContract();
      const contractOwner = await contract.owner();
      
      // Check if the connected wallet is the owner
      const isAdmin = userAddress.toLowerCase() === contractOwner.toLowerCase();
      setIsOwner(isAdmin);
    } catch (error) {
      console.error('Owner check error:', error);
    }
  };

  const handleDisconnectWallet = async () => {
    try {
      await disconnectWallet();
      setConnected(false);
      setWalletAddress('');
      setNetworkName('');
      setIsOwner(false);
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
      setErrorMessage('Error disconnecting wallet');
    }
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const contract = getContract();
      
      // Get ticket price
      const price = await contract.TICKET_PRICE();
      setTicketPrice(ethers.formatEther(price));
      
      // Get contract balance
      const balance = await contract.getContractBalance();
      setContractBalance(ethers.formatEther(balance));

      // Get current round data
      const roundData = await contract.getCurrentRound();
      setCurrentRound({
        roundId: Number(roundData.roundId),
        isActive: roundData.isActive,
        totalTickets: Number(roundData.totalTickets),
        ticketsRemaining: Number(roundData.ticketsRemaining),
        participantsCount: Number(roundData.participantsCount),
        drawingComplete: roundData.drawingComplete
      });
      
      // Get user's ticket count for current round
      if (walletAddress) {
        try {
          const userTicketCount = await contract.getTicketsForParticipant(walletAddress);
          setUserTickets(Number(userTicketCount));
        } catch (err) {
          console.error("Error fetching user tickets:", err);
          setUserTickets(0);
        }
      }

      // Fetch winners for display
      try {
        const winnersList = [];
        // Get winners for past rounds, limit to the most recent 5 rounds
        const startRound = Math.max(1, Number(roundData.roundId) - 5);
        for (let i = Number(roundData.roundId); i >= startRound; i--) {
          try {
            const roundWinners = await contract.getWinners(i);
            if (roundWinners.length > 0) {
              // Add winners to the list with their positions
              for (let pos = 0; pos < roundWinners.length; pos++) {
                const winner = roundWinners[pos];
                if (winner !== ethers.ZeroAddress) {
                  let prize;
                  if (pos === 0) prize = await contract.FIRST_PRIZE();
                  else if (pos === 1) prize = await contract.SECOND_PRIZE();
                  else if (pos === 2) prize = await contract.THIRD_PRIZE();
                  
                  winnersList.push({
                    round: i,
                    address: winner,
                    position: pos + 1,
                    prize: ethers.formatEther(prize)
                  });
                }
              }
            }
          } catch (e) {
            console.error(`Could not get winners for round ${i}:`, e);
          }
        }
        setWinners(winnersList);
      } catch (err) {
        console.error("Error fetching winners:", err);
      }

      setLoading(false);
    } catch (error) {
      setErrorMessage('Error fetching data. Check console for details.');
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  }, [walletAddress]);

  const handleBuyTickets = async () => {
    if (!connected) {
      setErrorMessage('Please connect your wallet first');
      return;
    }

    if (!currentRound.isActive) {
      setErrorMessage('Lottery round is not currently active');
      return;
    }

    // Check if user already has maximum tickets
    if (userTickets + ticketCount > MAX_TICKETS_PER_WALLET) {
      setErrorMessage(`You can only buy up to ${MAX_TICKETS_PER_WALLET} tickets per round. You already have ${userTickets} tickets.`);
      return;
    }
    
    // Check if there are enough tickets remaining in the pool
    if (ticketCount > currentRound.ticketsRemaining) {
      setErrorMessage(`Not enough tickets available in the pool. Only ${currentRound.ticketsRemaining} tickets remaining.`);
      return;
    }

    try {
      setBuyingTickets(true);
      setTransactionSuccess(false);
      const contract = getContract();
      const ticketPriceWei = ethers.parseEther(ticketPrice);
      const totalCost = ticketPriceWei * window.BigInt(ticketCount);
      
      console.log(`Buying ${ticketCount} tickets for ${ethers.formatEther(totalCost)} STT`);
      const tx = await contract.buyTickets(ticketCount, { value: totalCost });
      console.log("Transaction hash:", tx.hash);
      await tx.wait();
      console.log("Transaction confirmed!");
      
      setErrorMessage('');
      setTransactionSuccess(true);
      
      // Reset success message after 5 seconds
      setTimeout(() => {
        setTransactionSuccess(false);
      }, 5000);
      
      fetchData(); // Refresh data
    } catch (error) {
      console.error('Error buying tickets:', error);
      
      // User-friendly error messages
      if (error.code === 4001 || 
          (error.message && (error.message.includes('user rejected') || error.message.includes('user denied')))) {
        setErrorMessage('Transaction cancelled by user');
      } else if (error.message && error.message.includes('insufficient funds')) {
        setErrorMessage('Insufficient funds in your wallet');
      } else if (error.message && error.message.includes('gas')) {
        setErrorMessage('Gas estimation failed. Transaction might fail');
      } else if (error.message && error.message.includes('maximum ticket')) {
        setErrorMessage('You have reached the maximum number of tickets for this round');
      } else if (error.message && error.message.includes('Not enough space in the pool')) {
        setErrorMessage(`Not enough tickets available in the pool. Only ${currentRound.ticketsRemaining} tickets remaining.`);
      } else {
        setErrorMessage('Failed to buy tickets: ' + (error.reason || error.message || 'Unknown error'));
      }
    } finally {
      setBuyingTickets(false);
    }
  };

  useEffect(() => {
    if (connected) {
      fetchData();
    }
  }, [connected, walletAddress, fetchData]);

  return (
    <div className="lottery-app">
      <nav className="navbar navbar-expand-lg navbar-dark">
        <div className="container">
          <div className="navbar-brand fw-bold">
            <i className="bi bi-ticket-perforated-fill me-2"></i>
            Lottery DApp
          </div>
          <div className="navbar-nav me-auto">
            {connected && isOwner && (
              <a className="btn btn-primary" href="/admin">
                <i className="bi bi-shield-lock-fill me-1"></i> Admin Panel
              </a>
            )}
          </div>
          <div className="d-flex align-items-center">
            {!connected ? (
              <button
                className="btn btn-light"
                onClick={handleConnectWallet}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    {switchingNetwork ? 'Switching to Somnia Network...' : 'Connecting...'}
                  </>
                ) : (
                  <><i className="bi bi-wallet2 me-2"></i>Connect Wallet</>
                )}
              </button>
            ) : (
              <div className="wallet-info-container">
                <div className="network-badge">
                  <i className="bi bi-broadcast-pin me-1"></i> {networkName}
                </div>
                <div className="wallet-address">
                  <i className="bi bi-wallet-fill me-2"></i>
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                  {isOwner && <span className="badge bg-warning ms-2">Admin</span>}
                </div>
                <button
                  className="btn btn-outline-light btn-sm disconnect-btn"
                  onClick={handleDisconnectWallet}
                >
                  <i className="bi bi-power me-1"></i>Disconnect
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      <div className="container mt-4">
        {errorMessage && (
          <div className="alert alert-danger alert-dismissible fade show" role="alert">
            <i className="bi bi-exclamation-triangle-fill me-2"></i>
            {errorMessage}
            <button type="button" className="btn-close" onClick={() => setErrorMessage('')}></button>
          </div>
        )}
        
        {errorMessage && errorMessage.includes('Somnia') && (
          <div className="alert alert-warning mt-2">
            <i className="bi bi-info-circle-fill me-2"></i>
            This application only works on <strong>Somnia Testnet</strong>. Please click the button below to try switching networks again.
            <div className="mt-3">
              <button 
                className="btn btn-warning" 
                onClick={handleConnectWallet}
                disabled={loading}
              >
                <i className="bi bi-arrow-repeat me-2"></i>
                Switch to Somnia Testnet
              </button>
            </div>
          </div>
        )}

        {transactionSuccess && (
          <div className="alert alert-success alert-dismissible fade show" role="alert">
            <i className="bi bi-check-circle-fill me-2"></i>
            Tickets purchased successfully! Good luck!
            <button type="button" className="btn-close" onClick={() => setTransactionSuccess(false)}></button>
          </div>
        )}
        
        {!connected ? (
          <div className="row justify-content-center mt-4">
            <div className="col-md-8">
              <div className="card shadow-lg border-0 rounded-3 welcome-card">
                <div className="card-body text-center p-4">
                  <i className="bi bi-ticket-perforated display-1 text-primary mb-3"></i>
                  <h1 className="display-5 fw-bold text-primary mb-2">Welcome to Lottery DApp</h1>
                  <p className="lead mb-3">Connect your wallet to participate in the lottery on Somnia Testnet!</p>
                  <h5 className="mb-3">How it works:</h5>
                  <div className="row mb-3">
                    <div className="col-md-4">
                      <div className="card h-100 border-0 shadow-sm">
                        <div className="card-body p-3">
                          <i className="bi bi-wallet-fill text-primary fs-2 mb-2"></i>
                          <h5 className="card-title">1. Connect Wallet</h5>
                          <p className="card-text small">Connect your MetaMask wallet to Somnia Testnet</p>
                        </div>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="card h-100 border-0 shadow-sm">
                        <div className="card-body p-3">
                          <i className="bi bi-cash-coin text-primary fs-2 mb-2"></i>
                          <h5 className="card-title">2. Buy Tickets</h5>
                          <p className="card-text small">Each ticket costs {ticketPrice} STT (max 2 per wallet)</p>
                        </div>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="card h-100 border-0 shadow-sm">
                        <div className="card-body p-3">
                          <i className="bi bi-trophy-fill text-primary fs-2 mb-2"></i>
                          <h5 className="card-title">3. Win Prizes</h5>
                          <p className="card-text small">Win up to 2.5 STT in prizes!</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button 
                    className="btn btn-primary btn-lg"
                    onClick={handleConnectWallet}
                    disabled={loading}
                  >
                    {loading ? (
                      <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Connecting...</>
                    ) : (
                      <><i className="bi bi-wallet2 me-2"></i>Connect Wallet</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : loading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary" style={{ width: '3rem', height: '3rem' }} role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <p className="mt-3 text-muted">Loading lottery data...</p>
          </div>
        ) : (
          <>
            <div className="row">
              {/* Current Round Stats */}
              <div className="col-md-4 mb-3">
                <div className="card shadow h-100 border-0 rounded-3">
                  <div className="card-header">
                    <h3 className="mb-0 text-center fw-bold text-white">Current Round</h3>
                  </div>
                  <div className="card-body p-3">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <h5 className="mb-0">Round #{currentRound.roundId}</h5>
                      <div>
                        <span 
                          className="d-inline-block btn btn-sm btn-outline-primary me-2"
                          role="button"
                          onClick={() => fetchData()}
                          style={{ cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.65 : 1 }}
                          title="Refresh Data"
                        >
                          <i className="bi bi-arrow-clockwise"></i>
                        </span>
                        <span className={currentRound.isActive ? "badge bg-success" : "badge bg-danger"}>
                          {currentRound.isActive ? "Active" : "Closed"}
                        </span>
                      </div>
                    </div>
                    
                    <div className="row g-2 mb-3">
                      <div className="col-6">
                        <div className="p-2 border rounded text-center">
                          <h6 className="mb-1 text-muted small">Contract Balance</h6>
                          <p className="mb-0 fw-bold text-primary">{contractBalance} STT</p>
                        </div>
                      </div>
                      <div className="col-6">
                        <div className="p-2 border rounded text-center">
                          <h6 className="mb-1 text-muted small">Ticket Price</h6>
                          <p className="mb-0 fw-bold text-primary">{ticketPrice} STT</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="row g-2">
                      <div className="col-6">
                        <div className="p-2 border rounded text-center">
                          <h6 className="mb-1 text-muted small">Tickets Sold</h6>
                          <p className="mb-0 fw-bold">{currentRound.totalTickets}</p>
                        </div>
                      </div>
                      <div className="col-6">
                        <div className="p-2 border rounded text-center">
                          <h6 className="mb-1 text-muted small">Remaining Tickets</h6>
                          <p className="mb-0 fw-bold">{currentRound.ticketsRemaining}</p>
                        </div>
                      </div>
                      <div className="col-6">
                        <div className="p-2 border rounded text-center">
                          <h6 className="mb-1 text-muted small">Participants</h6>
                          <p className="mb-0 fw-bold">{currentRound.participantsCount}</p>
                        </div>
                      </div>
                      <div className="col-6">
                        <div className="p-2 border rounded text-center">
                          <h6 className="mb-1 text-muted small">Your Tickets</h6>
                          <p className="mb-0 fw-bold">{userTickets}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Buy Tickets */}
              <div className="col-md-5 mb-3">
                <div className="card shadow h-100 border-0 rounded-3">
                  <div className="card-header">
                    <h3 className="mb-0 text-center fw-bold text-white">Buy Tickets</h3>
                  </div>
                  <div className="card-body p-3">
                    {!currentRound.isActive ? (
                      <div className="alert alert-warning py-2">
                        <i className="bi bi-exclamation-triangle-fill me-2"></i>
                        The lottery round is not active. Please wait for the next round to start.
                      </div>
                    ) : userTickets >= MAX_TICKETS_PER_WALLET ? (
                      <div className="alert alert-info py-2">
                        <i className="bi bi-info-circle-fill me-2"></i>
                        You've reached the maximum ticket limit ({MAX_TICKETS_PER_WALLET}) for this round.
                      </div>
                    ) : (
                      <>
                        <h5 className="mb-3 text-center">Each ticket costs {ticketPrice} STT</h5>
                        <div className="row justify-content-center mb-3">
                          <div className="col-md-8">
                            <div className="input-group">
                              <button 
                                className="btn btn-outline-secondary" 
                                type="button"
                                onClick={() => setTicketCount(Math.max(1, ticketCount - 1))}
                              >
                                <i className="bi bi-dash"></i>
                              </button>
                              <input 
                                type="text" 
                                className="form-control text-center" 
                                value={ticketCount}
                                onChange={(e) => {
                                  // Sadece rakam karakterlerine izin ver
                                  const value = e.target.value;
                                  const numericValue = value.replace(/[^0-9]/g, '');
                                  
                                  if (numericValue === '') {
                                    setTicketCount(1); // Boş bırakıldığında 1'e ayarla
                                  } else {
                                    const val = parseInt(numericValue);
                                    // Kalan izin verilen biletleri hesapla
                                    const maxAllowed = Math.min(
                                      MAX_TICKETS_PER_WALLET - userTickets, 
                                      currentRound.ticketsRemaining
                                    );
                                    setTicketCount(Math.min(val, maxAllowed));
                                  }
                                }}
                                min="1"
                                max={Math.min(MAX_TICKETS_PER_WALLET - userTickets, currentRound.ticketsRemaining)}
                              />
                              <button 
                                className="btn btn-outline-secondary" 
                                type="button"
                                onClick={() => {
                                  const maxAllowed = Math.min(
                                    MAX_TICKETS_PER_WALLET - userTickets,
                                    currentRound.ticketsRemaining
                                  );
                                  setTicketCount(Math.min(ticketCount + 1, maxAllowed));
                                }}
                              >
                                <i className="bi bi-plus"></i>
                              </button>
                            </div>
                          </div>
                        </div>
                        
                        <div className="text-center mb-3">
                          <h5>Total Cost: <span className="text-primary">{(ticketCount * parseFloat(ticketPrice)).toFixed(2)} STT</span></h5>
                          <p className="small mb-3">
                            <i className="bi bi-info-circle me-1"></i>
                            You can buy up to {MAX_TICKETS_PER_WALLET} tickets per round. You currently have {userTickets} tickets.
                          </p>
                          
                          {currentRound.ticketsRemaining < (MAX_TICKETS_PER_WALLET - userTickets) && (
                            <div className="alert alert-warning py-2 mb-2">
                              <i className="bi bi-exclamation-triangle-fill me-2"></i>
                              Only {currentRound.ticketsRemaining} tickets remaining in the pool!
                            </div>
                          )}
                          

                      
                          <button 
                            className="btn btn-primary"
                            onClick={handleBuyTickets}
                            disabled={buyingTickets || ticketCount < 1}
                          >
                            {buyingTickets ? (
                              <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Processing...</>
                            ) : (
                              <><i className="bi bi-cart-plus me-2"></i>Buy Tickets</>
                            )}
                          </button>
                        </div>
                      </>
                    )}
                    
                    {/* Prize Distribution */}
                    <div className="mt-3">
                      <h5 className="text-center mb-2">Prize Distribution</h5>
                      <div className="row g-2">
                        <div className="col-4">
                          <div className="card border-0 shadow-sm">
                            <div className="card-body p-2 text-center">
                              <i className="bi bi-trophy-fill text-warning fs-4"></i>
                              <h6 className="mt-1 mb-0">2.5 STT</h6>
                              <small className="text-muted">1st Prize</small>
                            </div>
                          </div>
                        </div>
                        <div className="col-4">
                          <div className="card border-0 shadow-sm">
                            <div className="card-body p-2 text-center">
                              <i className="bi bi-trophy-fill text-secondary fs-4"></i>
                              <h6 className="mt-1 mb-0">1.5 STT</h6>
                              <small className="text-muted">2nd Prize</small>
                            </div>
                          </div>
                        </div>
                        <div className="col-4">
                          <div className="card border-0 shadow-sm">
                            <div className="card-body p-2 text-center">
                              <i className="bi bi-trophy-fill text-danger fs-4"></i>
                              <h6 className="mt-1 mb-0">1 STT</h6>
                              <small className="text-muted">3rd Prize</small>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Last Winners */}
              <div className="col-md-3 mb-3">
                <div className="card shadow h-100 border-0 rounded-3">
                  <div className="card-header">
                    <h3 className="mb-0 text-center fw-bold text-white">Last Winners</h3>
                  </div>
                  <div className="card-body p-3">
                    {winners.length === 0 ? (
                      <div className="text-center py-4">
                        <i className="bi bi-trophy text-muted fs-1 mb-2"></i>
                        <p className="mb-0">No winners yet</p>
                        <p className="small text-muted">Be the first winner!</p>
                      </div>
                    ) : (
                      <div className="winners-section">
                        {/* Group winners by round */}
                        {Array.from(
                          // Get unique rounds in descending order (newest first)
                          [...new Set(winners.map(w => w.round))]
                            .sort((a, b) => b - a)
                            // Limit to last 2 rounds
                            .slice(0, 2)
                        ).map((roundId, roundIndex) => (
                          <div key={`round-${roundId}`}>
                            {/* Add separator between rounds */}
                            {roundIndex > 0 && (
                              <div className="round-separator my-2">
                                <div className="separator-line"></div>
                              </div>
                            )}
                            
                            {/* Round header */}
                            <div className="round-header mb-2">
                              <span className="badge bg-dark">Round #{roundId}</span>
                            </div>
                            
                            {/* Round winners */}
                            {winners
                              .filter(winner => winner.round === roundId)
                              .map((winner, index) => (
                                <div key={`${roundId}-${index}`} className="winner-item">
                                  <div className="winner-left">
                                    <div className="winner-position">
                                      {winner.position === 1 ? (
                                        <i className="bi bi-trophy-fill text-warning"></i>
                                      ) : winner.position === 2 ? (
                                        <i className="bi bi-trophy-fill text-secondary"></i>
                                      ) : (
                                        <i className="bi bi-trophy-fill text-danger"></i>
                                      )}
                                    </div>
                                    <div>
                                      <div className="winner-address">
                                        {winner.address.slice(0, 6)}...{winner.address.slice(-4)}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="winner-prize">
                                    {winner.prize} STT
                                  </div>
                                </div>
                              ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {/* How It Works */}
            <div className="row">
              <div className="col-md-12">
                <div className="card shadow border-0 rounded-3">
                  <div className="card-header">
                    <h3 className="mb-0 text-center fw-bold text-white">How It Works</h3>
                  </div>
                  <div className="card-body p-3">
                    <div className="row">
                      <div className="col-md-3">
                        <div className="text-center mb-3">
                          <div className="step-circle">1</div>
                          <h5 className="mt-2 mb-1">Buy Tickets</h5>
                          <p className="small">Purchase lottery tickets for {ticketPrice} STT each. You can buy up to {MAX_TICKETS_PER_WALLET} tickets per wallet per round.</p>
                        </div>
                      </div>
                      <div className="col-md-3">
                        <div className="text-center mb-3">
                          <div className="step-circle">2</div>
                          <h5 className="mt-2 mb-1">Lottery Closes</h5>
                          <p className="small">The lottery round will close once there are at least 3 participants and the prize pool reaches 5 STT.</p>
                        </div>
                      </div>
                      <div className="col-md-3">
                        <div className="text-center mb-3">
                          <div className="step-circle">3</div>
                          <h5 className="mt-2 mb-1">Winners Selected</h5>
                          <p className="small">Three winners are randomly selected. Each ticket purchase increases your chances of winning!</p>
                        </div>
                      </div>
                      <div className="col-md-3">
                        <div className="text-center mb-3">
                          <div className="step-circle">4</div>
                          <h5 className="mt-2 mb-1">Prizes Awarded</h5>
                          <p className="small">Winners receive their prizes automatically. First place: 2.5 STT, Second: 1.5 STT, Third: 1 STT.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      
      <footer className="py-3 mt-4">
        <div className="container text-center">
          <p className="mb-0 text-muted">
            <small>Lottery DApp on Somnia Testnet | &copy; {new Date().getFullYear()}</small>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;