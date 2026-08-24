package com.flexscribe.service;

import com.flexscribe.dto.goal.GoalRequest;
import com.flexscribe.model.FinancialGoal;
import com.flexscribe.model.GoalContribution;
import com.flexscribe.repository.FinancialGoalRepository;
import com.flexscribe.repository.GoalContributionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Service
public class GoalService {

    @Autowired private FinancialGoalRepository goalRepo;
    @Autowired private GoalContributionRepository contributionRepo;

    public List<FinancialGoal> getAllByUser(Integer subscriberID) {
        return goalRepo.findBySubscriberIDOrderByCreatedAtDesc(subscriberID);
    }

    public FinancialGoal getById(Integer goalID, Integer subscriberID) {
        return goalRepo.findByGoalIDAndSubscriberID(goalID, subscriberID)
                .orElseThrow(() -> new RuntimeException("Goal not found"));
    }

    public List<GoalContribution> getContributions(Integer goalID) {
        return contributionRepo.findByGoalIDOrderByCreatedAtDesc(goalID);
    }

    @Transactional
    public FinancialGoal create(Integer subscriberID, GoalRequest req) {
        FinancialGoal goal = FinancialGoal.builder()
                .subscriberID(subscriberID)
                .goalName(req.getGoalName())
                .targetAmount(req.getTargetAmount())
                .deadline(req.getDeadline() != null ? LocalDate.parse(req.getDeadline()) : null)
                .imageUrl(req.getImageUrl())
                .build();
        return goalRepo.save(goal);
    }

    @Transactional
    public FinancialGoal update(Integer goalID, Integer subscriberID, GoalRequest req) {
        FinancialGoal goal = getById(goalID, subscriberID);
        if (req.getGoalName() != null) goal.setGoalName(req.getGoalName());
        if (req.getTargetAmount() != null) goal.setTargetAmount(req.getTargetAmount());
        if (req.getDeadline() != null) goal.setDeadline(LocalDate.parse(req.getDeadline()));
        goal.setImageUrl(req.getImageUrl());
        if (req.getGoalStatus() != null) goal.setGoalStatus(req.getGoalStatus());
        return goalRepo.save(goal);
    }

    @Transactional
    public void delete(Integer goalID, Integer subscriberID) {
        FinancialGoal goal = getById(goalID, subscriberID);
        contributionRepo.deleteAll(contributionRepo.findByGoalIDOrderByCreatedAtDesc(goalID));
        goalRepo.delete(goal);
    }

    @Transactional
    public FinancialGoal contribute(Integer goalID, Integer subscriberID, Double amount, String source) {
        FinancialGoal goal = getById(goalID, subscriberID);
        goal.setCurrentProgress(goal.getCurrentProgress() + amount);
        goal.setLastTopUpDate(LocalDateTime.now());

        if (goal.getCurrentProgress() >= goal.getTargetAmount()) {
            goal.setGoalStatus("completed");
        }
        goalRepo.save(goal);

        GoalContribution contribution = GoalContribution.builder()
                .goalID(goalID)
                .amount(amount)
                .source(source != null ? source : "manual")
                .build();
        contributionRepo.save(contribution);

        return goal;
    }
}
