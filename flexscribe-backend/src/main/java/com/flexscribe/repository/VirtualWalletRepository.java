package com.flexscribe.repository;

import com.flexscribe.model.VirtualWallet;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface VirtualWalletRepository extends JpaRepository<VirtualWallet, Integer> {

    Optional<VirtualWallet> findBySubscriberID(Integer subscriberID);
}
