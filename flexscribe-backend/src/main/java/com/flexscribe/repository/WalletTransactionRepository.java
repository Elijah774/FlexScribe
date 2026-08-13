package com.flexscribe.repository;

import com.flexscribe.model.WalletTransaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface WalletTransactionRepository extends JpaRepository<WalletTransaction, Integer> {

    List<WalletTransaction> findByWalletIDOrderByTransactionDateDesc(Integer walletID);

    List<WalletTransaction> findTop10ByWalletIDOrderByTransactionDateDesc(Integer walletID);
}
