import React, { useEffect, useState, useCallback } from 'react';
import { connectWallet, disconnectWallet, getContract } from './utils/contract';
import { ethers } from 'ethers';
import './custom.css';

const AdminPanel = () => {
  const [connected, setConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [prizePool, setPrizePool] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [isRoundActive, setIsRoundActive] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [ownerAddress, setOwnerAddress] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [selectingWinners, setSelectingWinners] = useState(false);
  const [withdrawingFunds, setWithdrawingFunds] = useState(false);
  const [networkName, setNetworkName] = useState('');
  const [roundNumber, setRoundNumber] = useState(0);
  const [winners, setWinners] = useState([]);
  const [contractBalance, setContractBalance] = useState(null);

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
      
      // Prize pool
      const pool = await contract.prizePool();
      setPrizePool(ethers.formatEther(pool));
      
      // Contract balance
      const provider = new ethers.BrowserProvider(window.ethereum);
      const balance = await provider.getBalance(contract.target);
      setContractBalance(ethers.formatEther(balance));
      
      // Round status
      const roundStatus = await contract.isRoundActive();
      setIsRoundActive(roundStatus);
      
      // Round number
      const round = await contract.roundNumber();
      setRoundNumber(Number(round));
      
      // Participants
      try {
        const participantsList = [];
        let i = 0;
        let hasMore = true;
        
        while (hasMore) {
          try {
            const participant = await contract.participants(i);
            participantsList.push(participant);
            i++;
          } catch (e) {
            hasMore = false;
          }
        }
        
        setParticipants(participantsList);
      } catch (err) {
        console.error("Error fetching participants:", err);
      }

      // Past winners
      try {
        const winnersList = [];
        for (let i = 1; i < roundNumber; i++) {
          try {
            const winner = await contract.pastWinners(i);
            if (winner.winnerAddress !== ethers.ZeroAddress) {
              winnersList.push({
                round: i,
                address: winner.winnerAddress,
                prize: ethers.formatEther(winner.prizeAmount)
              });
            }
          } catch (e) {
            console.error(`Could not get winner for round ${i}:`, e);
          }
        }
        setWinners(winnersList);
      } catch (err) {
        console.error("Error fetching winners:", err);
      }

      setLoading(false);
    } catch (error) {
      setErrorMessage('Error fetching data');
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  }, [roundNumber]);

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

  const handleSelectWinners = async () => {
    if (!connected || !isOwner) {
      setErrorMessage('You must be the contract owner to perform this action');
      return;
    }

    if (isRoundActive) {
      setErrorMessage('Cannot select winners because the round is still active');
      return;
    }

    try {
      setSelectingWinners(true);
      setSuccessMessage('');
      setErrorMessage('');
      
      const contract = getContract();
      const tx = await contract.selectWinners();
      await tx.wait();
      
      setSuccessMessage('Lottery completed successfully! Winners have been selected.');
      
      // Update data
      fetchData();
    } catch (error) {
      console.error('Error selecting winners:', error);
      
      if (error.message && error.message.includes('Not enough participants')) {
        setErrorMessage('Cannot select winners: Not enough participants (need at least 3)');
      } else if (error.code === 4001 || error.message.includes('user rejected')) {
        setErrorMessage('Transaction rejected by user');
      } else if (error.message && error.message.includes('Lottery round is still active')) {
        setErrorMessage('Cannot select winners because the round is still active');
      } else {
        setErrorMessage('Error selecting winners. Please try again');
      }
    } finally {
      setSelectingWinners(false);
    }
  };

  const handleWithdrawFunds = async () => {
    if (!connected || !isOwner) {
      setErrorMessage('You must be the contract owner to perform this action');
      return;
    }

    try {
      setWithdrawingFunds(true);
      setSuccessMessage('');
      setErrorMessage('');
      
      const contract = getContract();
      const tx = await contract.withdrawFunds();
      await tx.wait();
      
      setSuccessMessage('Funds withdrawn successfully!');
      
      // Update data
      fetchData();
    } catch (error) {
      console.error('Error withdrawing funds:', error);
      
      if (error.code === 4001 || error.message.includes('user rejected')) {
        setErrorMessage('Transaction rejected by user');
      } else {
        setErrorMessage('Error withdrawing funds. Please try again');
      }
    } finally {
      setWithdrawingFunds(false);
    }
  };

  useEffect(() => {
    if (connected) {
      checkOwner(walletAddress).then(isAdmin => {
        if (isAdmin) {
          fetchData();
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
          <div className="row justify-content-center mt-5">
            <div className="col-md-8">
              <div className="card shadow-lg border-0 rounded-3">
                <div className="card-body text-center p-5">
                  <i className="bi bi-shield-lock display-1 text-primary mb-4"></i>
                  <h1 className="display-5 fw-bold text-primary mb-3">Admin Panel</h1>
                  <p className="lead mb-4">Connect your wallet to manage the lottery</p>
                  <p className="mb-4 text-danger">
                    <i className="bi bi-exclamation-triangle me-2"></i>
                    This page is restricted to contract owner only.
                  </p>
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
        ) : !isOwner ? (
          <div className="row justify-content-center mt-5">
            <div className="col-md-8">
              <div className="card shadow-lg border-0 rounded-3">
                <div className="card-body text-center p-5">
                  <i className="bi bi-x-circle display-1 text-danger mb-4"></i>
                  <h1 className="display-5 fw-bold text-danger mb-3">Access Denied</h1>
                  <p className="lead mb-4">This page is only accessible to the contract owner</p>
                  <div className="alert alert-info">
                    <p className="mb-0">
                      <strong>Contract Owner:</strong> {ownerAddress}
                    </p>
                    <p className="mb-0">
                      <strong>Your Address:</strong> {walletAddress}
                    </p>
                  </div>
                  <button 
                    className="btn btn-secondary mt-3"
                    onClick={handleDisconnectWallet}
                  >
                    <i className="bi bi-box-arrow-left me-2"></i>Exit
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
            <div className="row mb-4">
              <div className="col-md-12">
                <div className="card shadow border-0 rounded-3">
                  <div className="card-header bg-primary text-white">
                    <h3 className="mb-0 text-center fw-bold">Lottery Status</h3>
                  </div>
                  <div className="card-body">
                    <div className="row">
                      <div className="col-md-3">
                        <div className="text-center p-3">
                          <h5 className="text-muted mb-3">Current Round</h5>
                          <h2 className="display-5 fw-bold text-primary">{roundNumber}</h2>
                        </div>
                      </div>
                      <div className="col-md-3">
                        <div className="text-center p-3">
                          <h5 className="text-muted mb-3">Prize Pool</h5>
                          <h2 className="display-5 fw-bold text-primary">{prizePool} STT</h2>
                        </div>
                      </div>
                      <div className="col-md-3">
                        <div className="text-center p-3">
                          <h5 className="text-muted mb-3">Contract Balance</h5>
                          <h2 className="display-5 fw-bold text-success">{contractBalance} STT</h2>
                        </div>
                      </div>
                      <div className="col-md-3">
                        <div className="text-center p-3">
                          <h5 className="text-muted mb-3">Status</h5>
                          <h2>
                            <span className={isRoundActive ? "badge bg-success fs-4" : "badge bg-danger fs-4"}>
                              {isRoundActive ? "Active" : "Waiting For Draw"}
                            </span>
                          </h2>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="row mb-4">
              <div className="col-md-6">
                <div className="card shadow h-100 border-0 rounded-3">
                  <div className="card-header bg-dark text-white">
                    <h3 className="mb-0 text-center fw-bold">Lottery Operations</h3>
                  </div>
                  <div className="card-body">
                    <div className="d-grid gap-3 p-3">
                      <button 
                        className="btn btn-success btn-lg"
                        onClick={handleSelectWinners}
                        disabled={selectingWinners || isRoundActive || participants.length < 3}
                      >
                        {selectingWinners ? (
                          <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Processing...</>
                        ) : (
                          <><i className="bi bi-trophy me-2"></i>Start Lottery Draw</>
                        )}
                      </button>
                      
                      {isRoundActive && (
                        <div className="alert alert-warning">
                          <i className="bi bi-info-circle-fill me-2"></i>
                          Cannot start draw because the round is still active. The round will close automatically when the prize pool reaches 5 STT.
                        </div>
                      )}
                      
                      {participants.length < 3 && !isRoundActive && (
                        <div className="alert alert-danger">
                          <i className="bi bi-exclamation-triangle-fill me-2"></i>
                          Not enough participants for the draw. Need at least 3 participants, currently have {participants.length}.
                        </div>
                      )}
                      
                      <hr />
                      
                      <button 
                        className="btn btn-warning btn-lg"
                        onClick={handleWithdrawFunds}
                        disabled={withdrawingFunds}
                      >
                        {withdrawingFunds ? (
                          <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Processing...</>
                        ) : (
                          <><i className="bi bi-cash-coin me-2"></i>Withdraw Remaining Funds</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="col-md-6">
                <div className="card shadow h-100 border-0 rounded-3">
                  <div className="card-header bg-dark text-white">
                    <h3 className="mb-0 text-center fw-bold">Participants</h3>
                  </div>
                  <div className="card-body">
                    {participants.length === 0 ? (
                      <div className="text-center py-5">
                        <i className="bi bi-people text-muted display-1 mb-3"></i>
                        <h4>No participants yet</h4>
                      </div>
                    ) : (
                      <div className="table-responsive">
                        <table className="table table-sm table-hover">
                          <thead>
                            <tr>
                              <th scope="col">#</th>
                              <th scope="col">Wallet Address</th>
                            </tr>
                          </thead>
                          <tbody>
                            {participants.map((participant, index) => (
                              <tr key={index}>
                                <th scope="row">{index + 1}</th>
                                <td className="text-break">{participant}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="card shadow border-0 rounded-3 mb-4">
              <div className="card-header bg-dark text-white">
                <h3 className="mb-0 text-center fw-bold">
                  <i className="bi bi-award me-2"></i>
                  Past Winners
                </h3>
              </div>
              <div className="card-body">
                {winners.length === 0 ? (
                  <div className="text-center py-5">
                    <i className="bi bi-emoji-smile display-1 text-muted mb-3"></i>
                    <h4>No winners yet</h4>
                    <p className="text-muted">Winners will appear here after the first draw</p>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover">
                      <thead>
                        <tr>
                          <th scope="col">Round</th>
                          <th scope="col">Wallet Address</th>
                          <th scope="col" className="text-end">Prize</th>
                        </tr>
                      </thead>
                      <tbody>
                        {winners.map((winner, index) => (
                          <tr key={index}>
                            <th scope="row">{winner.round}</th>
                            <td className="text-break">{winner.address}</td>
                            <td className="text-end">{winner.prize} STT</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      
      <footer className="py-4 mt-5 bg-light">
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