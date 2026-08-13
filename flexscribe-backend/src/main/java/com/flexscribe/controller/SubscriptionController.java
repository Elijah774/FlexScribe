package com.flexscribe.controller;

import com.flexscribe.dto.ApiResponse;
import com.flexscribe.dto.subscription.SubscriptionRequest;
import com.flexscribe.dto.subscription.SubscriptionStatsResponse;
import com.flexscribe.model.Subscription;
import com.flexscribe.security.CurrentUser;
import com.flexscribe.service.SubscriptionService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/subscriptions")
public class SubscriptionController {

    @Autowired private SubscriptionService subscriptionService;

    @GetMapping
    public ResponseEntity<List<Subscription>> getAll() {
        return ResponseEntity.ok(subscriptionService.getAllByUser(CurrentUser.getId()));
    }

    @GetMapping("/stats")
    public ResponseEntity<SubscriptionStatsResponse> getStats() {
        return ResponseEntity.ok(subscriptionService.getStats(CurrentUser.getId()));
    }

    @PostMapping
    public ResponseEntity<Subscription> create(@Valid @RequestBody SubscriptionRequest req) {
        Subscription sub = subscriptionService.create(CurrentUser.getId(), req);
        return ResponseEntity.status(HttpStatus.CREATED).body(sub);
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Integer id, @RequestBody SubscriptionRequest req) {
        try {
            Subscription sub = subscriptionService.update(id, CurrentUser.getId(), req);
            return ResponseEntity.ok(sub);
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Integer id) {
        try {
            subscriptionService.delete(id, CurrentUser.getId());
            return ResponseEntity.ok(ApiResponse.ok("Subscription deleted"));
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(e.getMessage()));
        }
    }

    @PatchMapping("/{id}/toggle")
    public ResponseEntity<?> toggle(@PathVariable Integer id) {
        try {
            Subscription sub = subscriptionService.toggle(id, CurrentUser.getId());
            return ResponseEntity.ok(sub);
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(e.getMessage()));
        }
    }
}
