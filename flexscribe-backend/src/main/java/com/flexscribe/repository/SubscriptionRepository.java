package com.flexscribe.repository;

import com.flexscribe.model.Subscription;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SubscriptionRepository extends JpaRepository<Subscription, Integer> {

    List<Subscription> findBySubscriberIDOrderByCreatedAtDesc(Integer subscriberID);

    List<Subscription> findBySubscriberIDAndSubStatus(Integer subscriberID, String subStatus);

    Optional<Subscription> findBySubscriptionIDAndSubscriberID(Integer subscriptionID, Integer subscriberID);

    long countBySubscriberIDAndSubStatus(Integer subscriberID, String subStatus);
}
