import { Shield, HardHat } from "lucide-react";
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useChainId, useBalance, useAccount } from 'wagmi';

export const Header = () => {
  const chainId = useChainId();
  const { address } = useAccount();
  const { data: balance } = useBalance({
    address: address,
  });

  const getChainName = () => {
    switch (chainId) {
      case 31337:
        return 'Hardhat';
      case 11155111:
        return 'Sepolia';
      default:
        return `Chain ${chainId}`;
    }
  };

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/lawvault-logo.svg" alt="LawVault Logo" className="h-12 w-12" onError={(e) => {
              // Fallback if image fails to load
              e.currentTarget.style.display = 'none';
            }} />
            <div>
              <h1 className="text-2xl font-bold text-foreground">LawVault</h1>
              <p className="text-xs text-muted-foreground">Secure Legal Exchange</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <Shield className="h-5 w-5 text-yellow-500" />
            <span className="text-sm text-muted-foreground hidden sm:inline">
              End-to-End Encrypted
            </span>
            {/* Network indicator */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border ${
              chainId === 31337 
                ? 'bg-yellow-500/10 border-yellow-500/20' 
                : chainId === 11155111
                ? 'bg-blue-500/10 border-blue-500/20'
                : 'bg-gray-500/10 border-gray-500/20'
            }`}>
              {chainId === 31337 && <HardHat className="h-4 w-4 text-yellow-500" />}
              {chainId === 11155111 && (
                <svg className="h-4 w-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              )}
              <span className={`text-sm font-medium ${
                chainId === 31337 
                  ? 'text-yellow-700 dark:text-yellow-400' 
                  : chainId === 11155111
                  ? 'text-blue-700 dark:text-blue-400'
                  : 'text-gray-700 dark:text-gray-400'
              }`}>
                {getChainName()}
              </span>
            </div>
            {balance && (
              <div className="hidden md:flex items-center gap-1 text-sm font-medium">
                <span>{parseFloat(balance.formatted).toFixed(1)}</span>
                <span className="text-muted-foreground">ETH</span>
              </div>
            )}
            <ConnectButton />
          </div>
        </div>
      </div>
    </header>
  );
};

