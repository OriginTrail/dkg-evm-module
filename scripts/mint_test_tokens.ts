import {ethers, getNamedAccounts} from 'hardhat';

async function main() {
    const accounts = await ethers.getSigners();
    const {minter} = await getNamedAccounts();

    const tokenContract = await ethers.getContract('ERC20Token');
    const amountToMint = ethers.utils.parseEther(`${5_000_000}`);

    for (const acc of accounts) {
        await tokenContract.mint(
            acc.address,
            amountToMint,
            {from: minter, gasLimit: 80_000},
        );
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
