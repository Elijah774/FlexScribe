package com.flexscribe.service;

import com.flexscribe.model.VirtualWallet;
import com.flexscribe.model.WalletTransaction;
import com.flexscribe.repository.VirtualWalletRepository;
import com.flexscribe.repository.WalletTransactionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class WalletService {

    @Autowired private VirtualWalletRepository walletRepo;
    @Autowired private WalletTransactionRepository txRepo;

    public VirtualWallet getWallet(Integer subscriberID) {
        return walletRepo.findBySubscriberID(subscriberID)
                .orElseThrow(() -> new RuntimeException("Wallet not found"));
    }

    public List<WalletTransaction> getTransactions(Integer subscriberID) {
        VirtualWallet wallet = getWallet(subscriberID);
        return txRepo.findByWalletIDOrderByTransactionDateDesc(wallet.getWalletID());
    }

    public List<WalletTransaction> getRecentTransactions(Integer subscriberID) {
        VirtualWallet wallet = getWallet(subscriberID);
        return txRepo.findTop10ByWalletIDOrderByTransactionDateDesc(wallet.getWalletID());
    }

    @Transactional
    public VirtualWallet addFunds(Integer subscriberID, Double amount, String source) {
        VirtualWallet wallet = getWallet(subscriberID);
        wallet.setBalance(wallet.getBalance() + amount);
        wallet.setLastTopUpDate(LocalDateTime.now());
        walletRepo.save(wallet);

        recordTransaction(wallet.getWalletID(), "credit", amount, wallet.getBalance(),
                "Funds added via " + (source != null ? source : "Bank Card"), "deposit", null, null, null);
        return wallet;
    }

    @Transactional
    public VirtualWallet withdraw(Integer subscriberID, Double amount, String destination) {
        VirtualWallet wallet = getWallet(subscriberID);
        if (wallet.getBalance() < amount) throw new RuntimeException("Insufficient balance");

        wallet.setBalance(wallet.getBalance() - amount);
        walletRepo.save(wallet);

        recordTransaction(wallet.getWalletID(), "debit", amount, wallet.getBalance(),
                "Withdrawal to " + (destination != null ? destination : "Bank Account"), "withdrawal", null, null, null);
        return wallet;
    }

    @Transactional
    public VirtualWallet transferToGoal(Integer subscriberID, Double amount, Integer goalID, String goalName) {
        VirtualWallet wallet = getWallet(subscriberID);
        if (wallet.getBalance() < amount) throw new RuntimeException("Insufficient balance");

        wallet.setBalance(wallet.getBalance() - amount);
        walletRepo.save(wallet);

        recordTransaction(wallet.getWalletID(), "transfer", amount, wallet.getBalance(),
                "Transfer to " + (goalName != null ? goalName : "Goal"), "transfer", null, goalID, null);
        return wallet;
    }

    @Transactional
    public VirtualWallet sendToDependant(Integer subscriberID, Double amount, Integer dependantID, String name) {
        VirtualWallet wallet = getWallet(subscriberID);
        if (wallet.getBalance() < amount) throw new RuntimeException("Insufficient balance");

        wallet.setBalance(wallet.getBalance() - amount);
        walletRepo.save(wallet);

        recordTransaction(wallet.getWalletID(), "debit", amount, wallet.getBalance(),
                "Sent to " + (name != null ? name : "Dependant"), "dependant", null, null, dependantID);
        return wallet;
    }

    private void recordTransaction(Integer walletID, String type, Double amount, Double balance,
                                   String desc, String category, Integer subID, Integer goalID, Integer depID) {
        WalletTransaction tx = WalletTransaction.builder()
                .walletID(walletID)
                .transactionType(type)
                .transactionAmount(amount)
                .runningBalance(balance)
                .description(desc)
                .category(category)
                .subscriptionID(subID)
                .goalID(goalID)
                .dependantID(depID)
                .build();
        txRepo.save(tx);
    }
}
