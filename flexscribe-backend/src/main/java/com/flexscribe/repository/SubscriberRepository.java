package com.flexscribe.repository;

import com.flexscribe.model.Subscriber;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface SubscriberRepository extends JpaRepository<Subscriber, Integer> {

    Optional<Subscriber> findByEmail(String email);

    boolean existsByEmail(String email);
}
