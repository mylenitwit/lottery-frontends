import React, { useEffect, useState, useCallback } from 'react';
import { connectWallet, disconnectWallet, getContract } from './utils/contract';
import { ethers } from 'ethers';
import './custom.css';

const AdminPanel = () => {
  const [connected, setConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentRound, setCurrentRound] = useState({
    roundId: 0,
    isActive: false,
    totalTickets: 0,
    ticketsRemaining: 0,
    participantsCount: 0,
    drawingComplete: false
  });
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [ownerAddress, setOwnerAddress] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [drawingWinners, setDrawingWinners] = useState(false);
  const [withdrawingFunds, setWithdrawingFunds] = useState(false);
  const [networkName, setNetworkName] = useState('');
  const [winners, setWinners] = useState([]);
  const [contractBalance, setContractBalance] = useState(null);
  const [addingFunds, setAddingFunds] = useState(false);
  const [fundAmount, setFundAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [resettingRound, setResettingRound] = useState(false);
  const [activeTab, setActiveTab] = useState('participants');
  const [participants, setParticipants] = useState([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);

  const checkOwner = async (userAddress) => {
    try {
      const contract = getContract();
      const contractOwner = await contract.owner();
      setOwnerAddress(contractOwner);
      
      // Case-insensitive comparison to handle potential format differences
      const isAdmin = userAddress.toLowerCase() === contractOwner.toLowerCase();
      setIsOwner(isAdmin);
      
      if (!isAdmin) {
        setErrorMessage('This page is only accessible by the contract owner');
      }
      
      return isAdmin;
    } catch (error) {
      console.error('Owner check error:', error);
      setErrorMessage('Error checking contract owner');
      return false;
    }
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const contract = getContract();
      
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
      
      // Contract balance
      const balance = await contract.getContractBalance();
      setContractBalance(ethers.formatEther(balance));
      
      // Past winners
      try {
        const winnersList = [];
        // Get winners for each past round - limited to last 2 rounds
        const currentRoundId = Number(roundData.roundId);
        // Calculate start round (max 2 rounds back or round 1, whichever is greater)
        const startRound = Math.max(1, currentRoundId - 2);
        
        for (let i = startRound; i <= currentRoundId; i++) {
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

      // Yeni: Mevcut tur için katılımcıları çek
      try {
        // Yeni getAllParticipantsInfo fonksiyonunu kullan
        const [addresses, ticketCounts] = await contract.getAllParticipantsInfo();
        
        // Her bir katılımcı için veri topla
        const participantData = [];
        
        // Adresler ve bilet sayılarını eşleştir
        for (let i = 0; i < addresses.length; i++) {
          participantData.push({
            address: addresses[i],
            tickets: Number(ticketCounts[i])
          });
        }
        
        setParticipants(participantData);
      } catch (err) {
        console.error("Error fetching participants:", err);
      }

      setLoading(false);
    } catch (error) {
      setErrorMessage('Error fetching data');
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  }, []);

  const handleConnectWallet = async () => {
    try {
      setLoading(true);
      const address = await connectWallet();
      setWalletAddress(address);
      setConnected(true);
      setErrorMessage('');
      setNetworkName('Somnia Testnet');
      
      await checkOwner(address);
    } catch (error) {
      console.error('Error connecting wallet:', error);
      
      if (error.code === 4001 || 
          (error.message && (error.message.includes('user rejected') || error.message.includes('user denied')))) {
        setErrorMessage('Wallet connection rejected by user');
      } else if (error.message && error.message.includes('Already processing')) {
        setErrorMessage('Already processing a wallet request');
      } else if (!window.ethereum) {
        setErrorMessage('MetaMask is not installed. Please install MetaMask');
      } else if (error.message && error.message.includes('Somnia')) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Wallet connection failed. Please try again');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnectWallet = async () => {
    try {
      await disconnectWallet();
      setConnected(false);
      setWalletAddress('');
      setIsOwner(false);
      setNetworkName('');
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
      setErrorMessage('Error disconnecting wallet');
    }
  };

  const handleDrawWinners = async () => {
    if (!connected || !isOwner) {
      setErrorMessage('You must be the contract owner to perform this action');
      return;
    }

    if (currentRound.isActive) {
      setErrorMessage('Cannot draw winners because the round is still active');
      return;
    }

    try {
      setDrawingWinners(true);
      setSuccessMessage('');
      setErrorMessage('');
      
      const contract = getContract();
      
      // Debug information
      try {
        console.log("Debug information:");
        console.log("- Round ID:", currentRound.roundId);
        console.log("- Round active:", currentRound.isActive);
        console.log("- Participants count:", currentRound.participantsCount);
        console.log("- Total tickets:", currentRound.totalTickets);
        console.log("- Contract balance:", contractBalance, "STT");
        
        // Check if minimum participants requirement is met
        const minParticipants = await contract.MIN_PARTICIPANTS();
        console.log("- Minimum participants required:", Number(minParticipants));
        
        if (currentRound.participantsCount < Number(minParticipants)) {
          throw new Error(`Not enough participants. Need at least ${Number(minParticipants)}.`);
        }
      } catch (debugError) {
        console.error("Debug error:", debugError);
        throw debugError;
      }
      
      console.log("Drawing winners...");
      const tx = await contract.drawWinners();
      console.log("Transaction hash:", tx.hash);
      console.log("Waiting for transaction confirmation...");
      await tx.wait();
      console.log("Transaction completed!");
      
      setSuccessMessage('Winners have been drawn successfully! A new round has been initialized.');
      
      // Update data
      fetchData();
    } catch (error) {
      console.error('Error drawing winners:', error);
      
      let errorMsg = '';
      
      if (error.message && error.message.includes('Not enough participants')) {
        errorMsg = 'Cannot draw winners: Not enough participants';
      } else if (error.code === 4001 || error.message.includes('user rejected')) {
        errorMsg = 'Transaction rejected by user';
      } else if (error.message && error.message.includes('Round still active')) {
        errorMsg = 'Cannot draw winners because the round is still active';
      } else if (error.message && error.message.includes('Drawing already complete')) {
        errorMsg = 'Drawing already completed for this round';
      } else {
        errorMsg = 'Error drawing winners: ' + (error.reason || error.message || 'Unknown error');
      }
      
      setErrorMessage(errorMsg);
    } finally {
      setDrawingWinners(false);
    }
  };

  const handleAddFunds = async () => {
    if (!connected || !isOwner) {
      setErrorMessage('You must be the contract owner to perform this action');
      return;
    }

    if (!fundAmount || parseFloat(fundAmount) <= 0) {
      setErrorMessage('Please enter a valid amount to add');
      return;
    }

    try {
      setAddingFunds(true);
      setSuccessMessage('');
      setErrorMessage('');
      
      const contract = getContract();
      const amountInWei = ethers.parseEther(fundAmount);
      
      const tx = await contract.depositFunds({ value: amountInWei });
      await tx.wait();
      
      setSuccessMessage(`${fundAmount} STT added to the contract successfully!`);
      setFundAmount('');
      
      // Update data
      fetchData();
    } catch (error) {
      console.error('Error adding funds:', error);
      
      if (error.code === 4001 || error.message.includes('user rejected')) {
        setErrorMessage('Transaction rejected by user');
      } else {
        setErrorMessage('Error adding funds. Please try again');
      }
    } finally {
      setAddingFunds(false);
    }
  };

  const handleWithdrawFunds = async () => {
    if (!connected || !isOwner) {
      setErrorMessage('You must be the contract owner to perform this action');
      return;
    }

    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      setErrorMessage('Please enter a valid amount to withdraw');
      return;
    }

    try {
      setWithdrawingFunds(true);
      setSuccessMessage('');
      setErrorMessage('');
      
      const contract = getContract();
      const amountInWei = ethers.parseEther(withdrawAmount);
      
      const tx = await contract.withdrawFunds(amountInWei);
      await tx.wait();
      
      setSuccessMessage(`${withdrawAmount} STT withdrawn successfully!`);
      setWithdrawAmount('');
      
      // Update data
      fetchData();
    } catch (error) {
      console.error('Error withdrawing funds:', error);
      
      if (error.code === 4001 || error.message.includes('user rejected')) {
        setErrorMessage('Transaction rejected by user');
      } else if (error.message.includes('Not enough funds')) {
        setErrorMessage('Not enough funds in the contract to withdraw');
      } else {
        setErrorMessage('Error withdrawing funds. Please try again');
      }
    } finally {
      setWithdrawingFunds(false);
    }
  };

  const handleResetRound = async () => {
    if (!connected || !isOwner) {
      setErrorMessage('You must be the contract owner to perform this action');
      return;
    }

    try {
      setResettingRound(true);
      setSuccessMessage('');
      setErrorMessage('');
      
      const contract = getContract();
      const tx = await contract.resetRound();
      await tx.wait();
      
      setSuccessMessage('Round has been reset and a new round has been initialized.');
      
      // Update data
      fetchData();
    } catch (error) {
      console.error('Error resetting round:', error);
      
      if (error.code === 4001 || error.message.includes('user rejected')) {
        setErrorMessage('Transaction rejected by user');
      } else if (error.message.includes('Round already completed')) {
        setErrorMessage('Cannot reset a completed round');
      } else {
        setErrorMessage('Error resetting round. Please try again');
      }
    } finally {
      setResettingRound(false);
    }
  };

  const getParticipants = async () => {
    try {
      setLoadingParticipants(true);
      const contract = getContract();
      
      // Yeni getAllParticipantsInfo fonksiyonunu kullan
      const [addresses, ticketCounts] = await contract.getAllParticipantsInfo();
      
      // Her bir katılımcı için veri topla
      const participantData = [];
      
      // Adresler ve bilet sayılarını eşleştir
      for (let i = 0; i < addresses.length; i++) {
        participantData.push({
          address: addresses[i],
          tickets: Number(ticketCounts[i])
        });
      }
      
      setParticipants(participantData);
    } catch (error) {
      console.error("Error fetching participants:", error);
      setErrorMessage("Failed to fetch participants");
    } finally {
      setLoadingParticipants(false);
    }
  };

  // Sayfa ilk yüklendiğinde activeTab'i participants olarak ayarla
  useEffect(() => {
    setActiveTab('participants');
  }, []);

  useEffect(() => {
    if (connected) {
      checkOwner(walletAddress).then(isAdmin => {
        if (isAdmin) {
          fetchData();
          // Katılımcıları otomatik olarak yükle
          getParticipants();
        }
      });
    }
  }, [connected, walletAddress, fetchData]);

  return (
    <div className="lottery-admin">
      <nav className="navbar navbar-expand-lg navbar-dark bg-dark">
        <div className="container">
          <div className="navbar-brand fw-bold">
            <i className="bi bi-shield-lock-fill me-2"></i>
            Lottery DApp - Admin Panel
          </div>
          <div className="navbar-nav me-auto">
            <a className="btn btn-primary me-2" href="/">
              <i className="bi bi-house-door-fill me-1"></i> Back to Home
            </a>
          </div>
          <div className="d-flex align-items-center">
            {!connected ? (
              <button
                className="btn btn-light"
                onClick={handleConnectWallet}
                disabled={loading}
              >
                {loading ? (
                  <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Connecting...</>
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
        
        {successMessage && (
          <div className="alert alert-success alert-dismissible fade show" role="alert">
            <i className="bi bi-check-circle-fill me-2"></i>
            {successMessage}
            <button type="button" className="btn-close" onClick={() => setSuccessMessage('')}></button>
          </div>
        )}

        {!connected ? (
          <div className="row justify-content-center mt-4">
            <div className="col-md-8">
              <div className="card shadow-lg border-0 rounded-3">
                <div className="card-body text-center p-4">
                  <i className="bi bi-shield-lock display-4 text-primary mb-3"></i>
                  <h1 className="display-6 fw-bold text-primary mb-2">Admin Panel</h1>
                  <p className="lead mb-3">Connect your wallet to manage the lottery</p>
                  <p className="mb-3 text-danger">
                    <i className="bi bi-exclamation-triangle me-2"></i>
                    This page is restricted to contract owner only.
                  </p>
                  <button 
                    className="btn btn-primary"
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
        ) : !isOwner ? (
          <div className="row justify-content-center mt-4">
            <div className="col-md-8">
              <div className="card shadow-lg border-0 rounded-3">
                <div className="card-body text-center p-4">
                  <i className="bi bi-x-circle display-4 text-danger mb-3"></i>
                  <h1 className="display-6 fw-bold text-danger mb-2">Access Denied</h1>
                  <p className="lead mb-3">This page is only accessible to the contract owner</p>
                  <div className="alert alert-info py-2">
                    <p className="mb-0">
                      <strong>Contract Owner:</strong> {ownerAddress}
                    </p>
                    <p className="mb-0">
                      <strong>Your Address:</strong> {walletAddress}
                    </p>
                  </div>
                  <button 
                    className="btn btn-secondary mt-2"
                    onClick={handleDisconnectWallet}
                  >
                    <i className="bi bi-box-arrow-left me-2"></i>Exit
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : loading ? (
          <div className="text-center py-4">
            <div className="spinner-border text-primary" style={{ width: '3rem', height: '3rem' }} role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <p className="mt-2 text-muted">Loading lottery data...</p>
          </div>
        ) : (
          <>
            <div className="row mb-3">
              <div className="col-md-12">
                <div className="card shadow border-0 rounded-3">
                  <div className="card-header bg-primary text-white py-2">
                    <div className="d-flex justify-content-between align-items-center">
                      <h4 className="mb-0 fw-bold">Lottery Status</h4>
                      <span
                        className="d-inline-block btn btn-sm btn-outline-light"
                        role="button"
                        onClick={fetchData}
                        style={{ cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.65 : 1 }}
                        title="Refresh Status"
                      >
                        <i className="bi bi-arrow-clockwise"></i>
                      </span>
                    </div>
                  </div>
                  <div className="card-body py-2">
                    <div className="row g-2">
                      <div className="col-md-2">
                        <div className="text-center p-2 border rounded">
                          <h6 className="text-muted mb-1 small">Round ID</h6>
                          <h5 className="mb-0 fw-bold text-primary">{currentRound.roundId}</h5>
                        </div>
                      </div>
                      <div className="col-md-2">
                        <div className="text-center p-2 border rounded">
                          <h6 className="text-muted mb-1 small">Participants</h6>
                          <h5 className="mb-0 fw-bold text-primary">{currentRound.participantsCount}</h5>
                        </div>
                      </div>
                      <div className="col-md-2">
                        <div className="text-center p-2 border rounded">
                          <h6 className="text-muted mb-1 small">Tickets Sold</h6>
                          <h5 className="mb-0 fw-bold text-primary">{currentRound.totalTickets}</h5>
                        </div>
                      </div>
                      <div className="col-md-2">
                        <div className="text-center p-2 border rounded">
                          <h6 className="text-muted mb-1 small">Tickets Left</h6>
                          <h5 className="mb-0 fw-bold text-info">{currentRound.ticketsRemaining}</h5>
                        </div>
                      </div>
                      <div className="col-md-2">
                        <div className="text-center p-2 border rounded">
                          <h6 className="text-muted mb-1 small">Balance</h6>
                          <h5 className="mb-0 fw-bold text-success">{contractBalance} STT</h5>
                        </div>
                      </div>
                      <div className="col-md-2">
                        <div className="text-center p-2 border rounded">
                          <h6 className="text-muted mb-1 small">Status</h6>
                          <span className={currentRound.isActive ? "badge bg-success" : "badge bg-danger"}>
                            {currentRound.isActive ? "Active" : "Closed"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="row">
              <div className="col-md-5 mb-3">
                <div className="card shadow h-100 border-0 rounded-3">
                  <div className="card-header bg-dark text-white py-2">
                    <h4 className="mb-0 text-center fw-bold">Lottery Management</h4>
                  </div>
                  <div className="card-body p-2">
                    <div className="d-grid gap-2">
                      {/* Round Management - Üstte */}
                      <div className="card mb-2">
                        <div className="card-header bg-primary text-white py-2">
                          <h5 className="mb-0">Round Management</h5>
                        </div>
                        <div className="card-body p-2">
                          <div className="d-grid gap-2">
                            <button 
                              className="btn btn-success"
                              onClick={handleDrawWinners}
                              disabled={
                                drawingWinners || 
                                currentRound.isActive || 
                                currentRound.participantsCount < 3 ||
                                currentRound.drawingComplete
                              }
                            >
                              {drawingWinners ? (
                                <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Drawing Winners...</>
                              ) : (
                                <><i className="bi bi-trophy me-2"></i>Draw Winners</>
                              )}
                            </button>
                            
                            {currentRound.isActive && (
                              <div className="alert alert-info py-1 mb-2 small">
                                <i className="bi bi-info-circle-fill me-1"></i>
                                Round is active. Wait until it closes.
                              </div>
                            )}
                            
                            {currentRound.participantsCount < 3 && !currentRound.isActive && (
                              <div className="alert alert-danger py-1 mb-2 small">
                                <i className="bi bi-exclamation-triangle-fill me-1"></i>
                                Need at least 3 participants (current: {currentRound.participantsCount}).
                              </div>
                            )}
                            
                            <button 
                              className="btn btn-danger"
                              onClick={handleResetRound}
                              disabled={resettingRound || currentRound.drawingComplete}
                            >
                              {resettingRound ? (
                                <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Resetting Round...</>
                              ) : (
                                <><i className="bi bi-arrow-clockwise me-2"></i>Reset Current Round</>
                              )}
                            </button>
                            
                            {currentRound.drawingComplete && (
                              <div className="alert alert-warning py-1 mb-0 small">
                                <i className="bi bi-info-circle-fill me-1"></i>
                                Drawing is already complete.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Fund Management - Altta */}
                      <div className="card">
                        <div className="card-header bg-info text-white py-2">
                          <h5 className="mb-0">Fund Management</h5>
                        </div>
                        <div className="card-body p-2">
                          <div className="mb-2">
                            <label htmlFor="fundAmount" className="form-label small fw-bold">Add Funds</label>
                            <div className="input-group input-group-sm mb-1">
                              <input 
                                type="text" 
                                className="form-control" 
                                id="fundAmount" 
                                placeholder="Amount in STT" 
                                value={fundAmount} 
                                onChange={(e) => {
                                  // Sadece rakam ve nokta karakterine izin ver
                                  const value = e.target.value;
                                  if (value === '' || /^[0-9]+\.?[0-9]*$/.test(value)) {
                                    setFundAmount(value);
                                  }
                                }}
                                min="0.01"
                                step="0.01"
                              />
                              <span className="input-group-text">STT</span>
                              <button 
                                className="btn btn-success"
                                onClick={handleAddFunds}
                                disabled={addingFunds || !fundAmount || parseFloat(fundAmount) <= 0}
                              >
                                {addingFunds ? (
                                  <><span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Adding</>
                                ) : (
                                  <><i className="bi bi-plus-circle me-1"></i>Add</>
                                )}
                              </button>
                            </div>
                            <div className="text-muted small mt-1">
                              <i className="bi bi-info-circle me-1"></i>
                              Only numbers and decimal point (.) allowed
                            </div>
                          </div>
                          
                          <div>
                            <label htmlFor="withdrawAmount" className="form-label small fw-bold">Withdraw Funds</label>
                            <div className="input-group input-group-sm">
                              <input 
                                type="text" 
                                className="form-control" 
                                id="withdrawAmount" 
                                placeholder="Amount in STT" 
                                value={withdrawAmount} 
                                onChange={(e) => {
                                  // Sadece rakam ve nokta karakterine izin ver
                                  const value = e.target.value;
                                  if (value === '' || /^[0-9]+\.?[0-9]*$/.test(value)) {
                                    setWithdrawAmount(value);
                                  }
                                }}
                                min="0.01"
                                step="0.01"
                              />
                              <span className="input-group-text">STT</span>
                              <button 
                                className="btn btn-warning"
                                onClick={handleWithdrawFunds}
                                disabled={withdrawingFunds || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
                              >
                                {withdrawingFunds ? (
                                  <><span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Withdrawing</>
                                ) : (
                                  <><i className="bi bi-cash-coin me-1"></i>Withdraw</>
                                )}
                              </button>
                            </div>
                            <div className="text-muted small mt-1">
                              <i className="bi bi-info-circle me-1"></i>
                              Only numbers and decimal point (.) allowed
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="col-md-7 mb-3">
                <div className="card shadow h-100 border-0 rounded-3">
                  <div className="card-header bg-dark text-white py-2">
                    <h4 className="mb-0 text-center fw-bold">Lottery Stats</h4>
                  </div>
                  <div className="card-body p-2">
                    <ul className="nav nav-tabs nav-fill mb-2" id="lotteryTabs" role="tablist">
                      <li className="nav-item" role="presentation">
                        <button 
                          className={`nav-link py-1 px-2 ${activeTab === 'participants' ? 'active' : ''}`} 
                          id="participants-tab" 
                          onClick={() => setActiveTab('participants')}
                          type="button" 
                          role="tab" 
                          aria-controls="participants" 
                          aria-selected={activeTab === 'participants'}
                        >
                          <i className="bi bi-people-fill me-1"></i>
                          <span className="small">Participants</span>
                        </button>
                      </li>
                      <li className="nav-item" role="presentation">
                        <button 
                          className={`nav-link py-1 px-2 ${activeTab === 'winners' ? 'active' : ''}`} 
                          id="winners-tab" 
                          onClick={() => setActiveTab('winners')}
                          type="button" 
                          role="tab" 
                          aria-controls="winners" 
                          aria-selected={activeTab === 'winners'}
                        >
                          <i className="bi bi-trophy-fill me-1"></i>
                          <span className="small">Winners</span>
                        </button>
                      </li>
                    </ul>
                    
                    <div className="tab-content" id="lotteryTabsContent" style={{ height: '350px', overflowY: 'auto' }}>
                      <div 
                        className={`tab-pane fade ${activeTab === 'participants' ? 'show active' : ''}`} 
                        id="participants" 
                        role="tabpanel" 
                        aria-labelledby="participants-tab"
                      >
                        <div className="d-flex justify-content-between align-items-center mb-3">
                          <h5 className="mb-0">Round Participants</h5>
                          <button 
                            className="btn btn-sm btn-outline-primary" 
                            onClick={getParticipants} 
                            disabled={loadingParticipants}
                          >
                            {loadingParticipants ? (
                              <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Loading...</>
                            ) : (
                              <><i className="bi bi-arrow-clockwise me-1"></i>Refresh Participants</>
                            )}
                          </button>
                        </div>
                        
                        {participants.length > 0 ? (
                          <div className="table-responsive">
                            <table className="table table-sm table-striped">
                              <thead className="table-dark">
                                <tr>
                                  <th scope="col">#</th>
                                  <th scope="col">Wallet Address</th>
                                  <th scope="col">Tickets</th>
                                </tr>
                              </thead>
                              <tbody>
                                {participants.map((participant, index) => (
                                  <tr key={index}>
                                    <td>{index + 1}</td>
                                    <td>
                                      <span className="d-inline-block text-truncate" style={{maxWidth: "200px"}}>
                                        {participant.address}
                                      </span>
                                    </td>
                                    <td>{participant.tickets}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="text-center py-3">
                            <p className="mb-0 text-muted">
                              {loadingParticipants ? 'Loading participants...' : 'No participants data available. Click "Refresh Participants" to load.'}
                            </p>
                          </div>
                        )}
                      </div>
                      
                      <div 
                        className={`tab-pane fade ${activeTab === 'winners' ? 'show active' : ''}`} 
                        id="winners" 
                        role="tabpanel" 
                        aria-labelledby="winners-tab"
                      >
                        {winners.length === 0 ? (
                          <div className="text-center py-3">
                            <i className="bi bi-emoji-smile display-4 text-muted mb-2"></i>
                            <h5>No winners yet</h5>
                            <p className="text-muted small">Winners will appear here after drawings</p>
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
                                  <div className="round-separator my-3">
                                    <div className="separator-line"></div>
                                  </div>
                                )}
                                
                                {/* Round header */}
                                <div className="round-header mb-3">
                                  <span className="badge bg-dark">Round #{roundId}</span>
                                </div>
                                
                                {/* Round winners table */}
                                <div className="table-responsive">
                                  <table className="table table-sm table-hover">
                                    <thead>
                                      <tr>
                                        <th scope="col" width="8%">Pos</th>
                                        <th scope="col" width="77%">Wallet Address</th>
                                        <th scope="col" width="15%" className="text-end">Prize</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {winners
                                        .filter(winner => winner.round === roundId)
                                        .map((winner, index) => (
                                          <tr key={`${roundId}-${index}`}>
                                            <td>
                                              {winner.position === 1 ? (
                                                <i className="bi bi-trophy-fill text-warning" title="1st Prize"></i>
                                              ) : winner.position === 2 ? (
                                                <i className="bi bi-trophy-fill text-secondary" title="2nd Prize"></i>
                                              ) : (
                                                <i className="bi bi-trophy-fill text-danger" title="3rd Prize"></i>
                                              )}
                                            </td>
                                            <td className="text-break small">
                                              {winner.address}
                                            </td>
                                            <td className="text-end">{winner.prize} STT</td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      
      <footer className="py-2 mt-3">
        <div className="container text-center">
          <p className="mb-0 text-muted">
            <small>Lottery DApp Admin Panel | &copy; {new Date().getFullYear()}</small>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default AdminPanel; 