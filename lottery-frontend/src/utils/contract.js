import { ethers } from 'ethers';
import contractABI from './contractABI'; 
import Web3Modal from 'web3modal';

const CONTRACT_ADDRESS = '0x747B5CdE93c8a6e0Ec1BE73574d7CC16DAb49Cb3';
const SOMNIA_TESTNET_ID = 50312;
const SOMNIA_RPC_URL = "https://dream-rpc.somnia.network";

const web3Modal = new Web3Modal({
  cacheProvider: true, // Cache the provider for faster reconnects
});

let provider;
let signer;
let contract;

export const switchToSomnia = async () => {
  if (!window.ethereum) {
    throw new Error("Metamask not found");
  }

  const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
  if (parseInt(currentChainId, 16) !== SOMNIA_TESTNET_ID) {
    try {
      // First try to switch chains
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ethers.toBeHex(SOMNIA_TESTNET_ID) }],
      });
      
      return true;
    } catch (error) {
      if (error.code === 4902) {
        try {
          // If chain is not defined, try to add it
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: ethers.toBeHex(SOMNIA_TESTNET_ID),
              chainName: "Somnia Testnet",
              nativeCurrency: { name: "Ether", symbol: "STT", decimals: 18 },
              rpcUrls: [SOMNIA_RPC_URL],
              blockExplorerUrls: ["https://shannon-explorer.somnia.network"],
            }]
          });
          
          // Try switching again after the chain is added
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: ethers.toBeHex(SOMNIA_TESTNET_ID) }],
          });
          
          return true;
        } catch (addError) {
          console.error("Failed to add Somnia Testnet:", addError);
          throw new Error("Failed to add Somnia Testnet network. You cannot use this application without switching to this network.");
        }
      } else if (error.code === 4001) {
        // User rejected the switch
        throw new Error("Somnia Testnet network switch was rejected. You must switch to Somnia network to use this application.");
      } else {
        console.error("Failed to switch network:", error);
        throw new Error("Failed to switch to Somnia network. Please switch manually to Somnia Testnet from MetaMask.");
      }
    }
  }
  
  return true;
};

export const connectWallet = async () => {
  try {
    provider = await web3Modal.connect();
    
    // Force switch to Somnia network
    await switchToSomnia();
    
    // Create provider and signer if network switch was successful
    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, signer);
    
    // Check the network again after connection, throw error if still not on Somnia
    const chainId = await provider.getNetwork().then(network => network.chainId);
    if (Number(chainId) !== SOMNIA_TESTNET_ID) {
      throw new Error("Automatic switch to Somnia Testnet failed. Please switch manually.");
    }
    
    return signer.getAddress();
  } catch (error) {
    console.error('Error connecting wallet:', error);
    
    // Clear connection if there's an error with Somnia switch or rejection
    if (error.message && (error.message.includes("Somnia") || error.code === 4001)) {
      if (provider && provider.disconnect) {
        try {
          await provider.disconnect();
        } catch (e) {
          console.log("Provider disconnect failed", e);
        }
      }
      await web3Modal.clearCachedProvider();
    }
    
    throw error;
  }
};

export const disconnectWallet = async () => {
  try {
    if (provider && provider.disconnect) {
      await provider.disconnect();
    }
    await web3Modal.clearCachedProvider();
    
    // Reset variables
    provider = null;
    signer = null;
    contract = null;
    
    // Force page reload to reset state
    window.location.reload();
  } catch (error) {
    console.error('Error disconnecting wallet:', error);
    throw error;
  }
};

export const getContract = () => {
  if (!contract) {
    throw new Error('Contract not initialized. Call connectWallet() first.');
  }
  return contract;
};