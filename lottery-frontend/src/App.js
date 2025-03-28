import React, { useEffect, useState } from 'react';
import { connectWallet, disconnectWallet, getContract } from './utils/contract';
import { ethers } from 'ethers';
import './custom.css';

const App = () => {
  const [connected, setConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [prizePool, setPrizePool] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [buyingTickets, setBuyingTickets] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [ticketCount, setTicketCount] = useState(1);
  const [isRoundActive, setIsRoundActive] = useState(true);
  const [networkName, setNetworkName] = useState('');
  const [transactionSuccess, setTransactionSuccess] = useState(false);
  const [switchingNetwork, setSwitchingNetwork] = useState(false);

  const handleConnectWallet = async () => {
    try {
      setLoading(true);
      setSwitchingNetwork(true);
      const address = await connectWallet();
      setWalletAddress(address);
      setConnected(true);
      setErrorMessage('');
      setNetworkName('Somnia Testnet');
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

  const handleDisconnectWallet = async () => {
    try {
      await disconnectWallet();
      setConnected(false);
      setWalletAddress('');
      setNetworkName('');
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
      setErrorMessage('Error disconnecting wallet');
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const contract = getContract();
      const pool = await contract.prizePool();
      setPrizePool(ethers.formatEther(pool));

      // Get round status
      const roundStatus = await contract.isRoundActive();
      setIsRoundActive(roundStatus);

      try {
        // Get participants (this might fail if there's no length method)
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

      setLoading(false);
    } catch (error) {
      setErrorMessage('Error fetching data. Check console for details.');
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  };

  const handleBuyTickets = async () => {
    if (!connected) {
      setErrorMessage('Please connect your wallet first');
      return;
    }

    if (!isRoundActive) {
      setErrorMessage('Lottery round is not currently active');
      return;
    }

    try {
      setBuyingTickets(true);
      setTransactionSuccess(false);
      const contract = getContract();
      const ticketPrice = ethers.parseEther('0.25'); // 0.25 STT per ticket
      const totalCost = ticketPrice * ethers.getBigInt(ticketCount);
      
      const tx = await contract.buyTickets(ticketCount, { value: totalCost });
      await tx.wait();
      
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
      } else {
        setErrorMessage('Failed to buy tickets. Please try again');
      }
    } finally {
      setBuyingTickets(false);
    }
  };

  useEffect(() => {
    if (connected) {
      fetchData();
    }
  }, [connected]);

  return (
    <div className="lottery-app">
      <nav className="navbar navbar-expand-lg navbar-dark">
        <div className="container">
          <div className="navbar-brand fw-bold">
            <i className="bi bi-ticket-perforated-fill me-2"></i>
            Lottery DApp
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
                Switch to Somnia Network
              </button>
            </div>
          </div>
        )}
        
        {transactionSuccess && (
          <div className="alert alert-success alert-dismissible fade show" role="alert">
            <i className="bi bi-check-circle-fill me-2"></i>
            Tickets purchased successfully!
            <button type="button" className="btn-close" onClick={() => setTransactionSuccess(false)}></button>
          </div>
        )}
        
        {!connected ? (
          <div className="row justify-content-center mt-5">
            <div className="col-md-8">
              <div className="card shadow-lg border-0 rounded-3 welcome-card">
                <div className="card-body text-center p-5">
                  <i className="bi bi-ticket-perforated display-1 text-primary mb-4"></i>
                  <h1 className="display-5 fw-bold text-primary mb-3">Welcome to Lottery DApp</h1>
                  <p className="lead mb-4">Connect your wallet to participate in the lottery on Somnia Testnet!</p>
                  <h5 className="mb-4">How it works:</h5>
                  <div className="row mb-4">
                    <div className="col-md-4">
                      <div className="card h-100 border-0 shadow-sm">
                        <div className="card-body">
                          <i className="bi bi-wallet-fill text-primary fs-1 mb-3"></i>
                          <h5 className="card-title">1. Connect Wallet</h5>
                          <p className="card-text">Connect your MetaMask wallet to Somnia Testnet</p>
                        </div>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="card h-100 border-0 shadow-sm">
                        <div className="card-body">
                          <i className="bi bi-cash-coin text-primary fs-1 mb-3"></i>
                          <h5 className="card-title">2. Buy Tickets</h5>
                          <p className="card-text">Each ticket costs 0.25 STT</p>
                        </div>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="card h-100 border-0 shadow-sm">
                        <div className="card-body">
                          <i className="bi bi-trophy-fill text-primary fs-1 mb-3"></i>
                          <h5 className="card-title">3. Win Prizes</h5>
                          <p className="card-text">Three winners will be selected randomly</p>
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
            <div className="row mb-4">
              <div className="col-md-6">
                <div className="card shadow h-100 border-0 rounded-3">
                  <div className="card-header">
                    <h3 className="mb-0 text-center fw-bold text-white">Prize Pool</h3>
                  </div>
                  <div className="card-body text-center">
                    <h2 className="display-4 fw-bold text-primary">{prizePool} STT</h2>
                    <div className="badge bg-primary mb-3 py-2 px-3 fs-6">
                      Status: <span className={isRoundActive ? "badge bg-success ms-1" : "badge bg-danger ms-1"}>
                        {isRoundActive ? "Active" : "Waiting for winner selection"}
                      </span>
                    </div>
                    <div className="prize-distribution mt-4">
                      <h5>Prize Distribution:</h5>
                      <div className="row text-center mt-3">
                        <div className="col-md-4">
                          <div className="card mb-2 border-0">
                            <div className="card-body py-3">
                              <i className="bi bi-trophy-fill text-warning fs-2"></i>
                              <h5 className="mt-2 mb-0">2.5 STT</h5>
                              <small className="text-muted">1st Prize</small>
                            </div>
                          </div>
                        </div>
                        <div className="col-md-4">
                          <div className="card mb-2 border-0">
                            <div className="card-body py-3">
                              <i className="bi bi-trophy text-secondary fs-2"></i>
                              <h5 className="mt-2 mb-0">1.5 STT</h5>
                              <small className="text-muted">2nd Prize</small>
                            </div>
                          </div>
                        </div>
                        <div className="col-md-4">
                          <div className="card mb-2 border-0">
                            <div className="card-body py-3">
                              <i className="bi bi-award text-danger fs-2"></i>
                              <h5 className="mt-2 mb-0">1 STT</h5>
                              <small className="text-muted">3rd Prize</small>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="col-md-6">
                <div className="card shadow h-100 border-0 rounded-3">
                  <div className="card-header">
                    <h3 className="mb-0 text-center fw-bold text-white">Buy Tickets</h3>
                  </div>
                  <div className="card-body">
                    {isRoundActive ? (
                      <div className="ticket-purchase p-3">
                        <div className="text-center mb-4">
                          <p className="lead">Each ticket costs <strong>0.25 STT</strong></p>
                          <p>The more tickets you buy, the higher your chances of winning!</p>
                        </div>
                        
                        <div className="ticket-counter mb-4">
                          <label className="form-label">Number of Tickets</label>
                          <div className="input-group input-group-lg">
                            <button 
                              className="btn btn-outline-secondary" 
                              type="button"
                              onClick={() => setTicketCount(Math.max(1, ticketCount - 1))}
                              disabled={buyingTickets}
                            >
                              <i className="bi bi-dash"></i>
                            </button>
                            <input 
                              type="number" 
                              className="form-control text-center"
                              value={ticketCount} 
                              onChange={(e) => setTicketCount(Math.max(1, parseInt(e.target.value) || 1))}
                              min="1"
                              disabled={buyingTickets}
                            />
                            <button 
                              className="btn btn-outline-secondary" 
                              type="button"
                              onClick={() => setTicketCount(ticketCount + 1)}
                              disabled={buyingTickets}
                            >
                              <i className="bi bi-plus"></i>
                            </button>
                          </div>
                        </div>
                        
                        <div className="d-grid">
                          <div className="price-summary mb-3 p-3 rounded">
                            <div className="d-flex justify-content-between">
                              <span>Cost per ticket:</span>
                              <span>0.25 STT</span>
                            </div>
                            <div className="d-flex justify-content-between">
                              <span>Number of tickets:</span>
                              <span>{ticketCount}</span>
                            </div>
                            <hr />
                            <div className="d-flex justify-content-between fw-bold">
                              <span>Total cost:</span>
                              <span>{(0.25 * ticketCount).toFixed(2)} STT</span>
                            </div>
                          </div>
                          
                          <button 
                            className="btn btn-primary btn-lg"
                            onClick={handleBuyTickets}
                            disabled={buyingTickets}
                          >
                            {buyingTickets ? (
                              <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Processing...</>
                            ) : (
                              <><i className="bi bi-cart-plus me-2"></i>Buy Tickets</>
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center p-5">
                        <i className="bi bi-clock-history text-muted display-1 mb-3"></i>
                        <h4>Lottery Round Closed</h4>
                        <p className="text-muted">The current lottery round has reached the threshold and is waiting for winners to be selected.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="card shadow border-0 rounded-3 mb-4">
              <div className="card-header">
                <h3 className="mb-0 text-center fw-bold text-white">
                  <i className="bi bi-people-fill me-2"></i>
                  Participants <span className="badge bg-light text-primary">{participants.length}</span>
                </h3>
              </div>
              <div className="card-body">
                {participants.length === 0 ? (
                  <div className="text-center py-5">
                    <i className="bi bi-emoji-smile display-1 text-muted mb-3"></i>
                    <h4>No participants yet</h4>
                    <p className="text-muted mb-4">Be the first to buy a ticket and start the lottery!</p>
                    {isRoundActive && (
                      <button 
                        className="btn btn-primary"
                        onClick={handleBuyTickets}
                        disabled={buyingTickets}
                      >
                        {buyingTickets ? (
                          <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Processing...</>
                        ) : (
                          <><i className="bi bi-ticket-perforated me-2"></i>Buy Your First Ticket</>
                        )}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover">
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
          </>
        )}
      </div>
      
      <footer className="py-4 mt-5">
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