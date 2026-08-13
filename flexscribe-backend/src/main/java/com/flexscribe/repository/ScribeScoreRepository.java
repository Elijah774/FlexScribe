package com.flexscribe.repository;

import com.flexscribe.model.ScribeScore;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ScribeScoreRepository extends JpaRepository<ScribeScore, Integer> {

    Optional<ScribeScore> findTopBySubscriberIDOrderByGeneratedAtDesc(Integer subscriberID);
}
