package com.flexscribe.controller;

import com.flexscribe.dto.ApiResponse;
import com.flexscribe.dto.goal.ContributionRequest;
import com.flexscribe.dto.goal.GoalRequest;
import com.flexscribe.model.FinancialGoal;
import com.flexscribe.model.GoalContribution;
import com.flexscribe.security.CurrentUser;
import com.flexscribe.service.GoalService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/goals")
public class GoalController {

    @Autowired private GoalService goalService;

    @GetMapping
    public ResponseEntity<List<FinancialGoal>> getAll() {
        return ResponseEntity.ok(goalService.getAllByUser(CurrentUser.getId()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getById(@PathVariable Integer id) {
        try {
            FinancialGoal goal = goalService.getById(id, CurrentUser.getId());
            List<GoalContribution> contributions = goalService.getContributions(id);
            Map<String, Object> response = new HashMap<>();
            response.put("goal", goal);
            response.put("contributions", contributions);
            return ResponseEntity.ok(response);
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(e.getMessage()));
        }
    }

    @PostMapping
    public ResponseEntity<FinancialGoal> create(@Valid @RequestBody GoalRequest req) {
        FinancialGoal goal = goalService.create(CurrentUser.getId(), req);
        return ResponseEntity.status(HttpStatus.CREATED).body(goal);
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Integer id, @RequestBody GoalRequest req) {
        try {
            FinancialGoal goal = goalService.update(id, CurrentUser.getId(), req);
            return ResponseEntity.ok(goal);
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Integer id) {
        try {
            goalService.delete(id, CurrentUser.getId());
            return ResponseEntity.ok(ApiResponse.ok("Goal deleted"));
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(e.getMessage()));
        }
    }

    @PostMapping("/{id}/contribute")
    public ResponseEntity<?> contribute(@PathVariable Integer id, @Valid @RequestBody ContributionRequest req) {
        try {
            FinancialGoal goal = goalService.contribute(id, CurrentUser.getId(), req.getAmount(), req.getSource());
            return ResponseEntity.ok(ApiResponse.ok("Contribution added", goal));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(ApiResponse.error(e.getMessage()));
        }
    }
}
