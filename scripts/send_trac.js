require('dotenv').config({ path: `${__dirname}/.env` });
const Web3 = require("web3");
const ERC20Token = require("../build/contracts/ERC20Token.json");


const environment = 'devnet';
console.log(`Running in ${environment} environment`);

const deployedContracts = require(`../reports/${environment}_contracts.json`);
const tokenContractAddress = deployedContracts.contracts.find((contract) => contract.name==='erc20Token');
console.log(`Using token contract address: ${tokenContractAddress}`);

const rpcEndpoint = process.env[`OTP_${environment.toUpperCase()}_RPC`]
console.log(`Initializing web3 with endpoint ${rpcEndpoint}`);
const web3 = new Web3(rpcEndpoint);

const TokenContract = new web3.eth.Contract(ERC20Token.abi, tokenContractAddress);


async function sendTrac(evmAddress) {
    {
        let tokenBalance = await TokenContract.methods.balanceOf(evmAddress).call();
        let balance = await web3.eth.getBalance(addressFrom);
        console.log(
            `Balance of ${addressFrom} is ${balance} OTP, ${tokenBalance} TRAC`
        );
        tokenBalance = await TokenContract.methods.balanceOf(evmWallet).call();
        console.log(
            `wallet number: ${evmWallets.indexOf(
                evmWallet
            )}, address: ${evmWallet}, balance: ${tokenBalance}`
        );
        if (tokenBalance > 1000) return;
        /* balance = await web3.eth.getBalance(evmWallet);
        console.log(
          `Balance of ${evmWallet} is ${balance} OTP, ${tokenBalance} TRAC`
        );

        console.log(
          `Attempting to make transaction from ${addressFrom} to ${evmWallet}`
        ); */
        const val = web3.utils.toWei("100000", "ether");
        // console.log(val);
        const gasLimit = await TokenContract.methods
            .mint(evmWallet, val)
            .estimateGas({
                from: addressFrom,
            });

        const encodedABI = TokenContract.methods.mint(evmWallet, val).encodeABI();
        const createTransaction = await web3.eth.accounts.signTransaction(
            {
                from: addressFrom,
                to: tokenAddress,
                data: encodedABI,
                gasPrice: 1000,
                gas: gasLimit,
            },
            privateKey
        );
        // Deploy transaction
        const createReceipt = await web3.eth.sendSignedTransaction(
            createTransaction.rawTransaction
        ); /*
  console.log(
    `Transaction successful with hash: ${createReceipt.transactionHash}`
  ); */

        tokenBalance = await TokenContract.methods.balanceOf(evmWallet).call();
        balance = await web3.eth.getBalance(evmWallet);
        console.log(
            `New balance of ${evmWallet} is ${balance} OTP, ${tokenBalance} TRAC`
        );
}
