package com.flexscribe.repository;

import com.flexscribe.model.GoalContribution;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface GoalContributionRepository extends JpaRepository<GoalContribution, Integer> {

    List<GoalContribution> findByGoalIDOrderByCreatedAtDesc(Integer goalID);
}
