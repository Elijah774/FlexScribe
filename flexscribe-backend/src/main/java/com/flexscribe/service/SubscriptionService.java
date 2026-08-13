package com.flexscribe.service;

import com.flexscribe.dto.subscription.SubscriptionRequest;
import com.flexscribe.dto.subscription.SubscriptionStatsResponse;
import com.flexscribe.model.Subscription;
import com.flexscribe.repository.SubscriptionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Service
public class SubscriptionService {

    @Autowired private SubscriptionRepository subscriptionRepo;

    public List<Subscription> getAllByUser(Integer subscriberID) {
        return subscriptionRepo.findBySubscriberIDOrderByCreatedAtDesc(subscriberID);
    }

    public SubscriptionStatsResponse getStats(Integer subscriberID) {
        List<Subscription> all = subscriptionRepo.findBySubscriberIDOrderByCreatedAtDesc(subscriberID);
        List<Subscription> active = all.stream().filter(s -> "active".equals(s.getSubStatus())).toList();

        double monthly = active.stream().mapToDouble(s -> {
            double amt = s.getBillingAmount();
            return switch (s.getBillingCycle()) {
                case "weekly" -> amt * 52 / 12;
                case "quarterly" -> amt / 3;
                case "yearly" -> amt / 12;
                default -> amt;
            };
        }).sum();

        return SubscriptionStatsResponse.builder()
                .activeCount(active.size())
                .totalCount(all.size())
                .monthlyTotal(Math.round(monthly * 100.0) / 100.0)
                .annualTotal(Math.round(monthly * 12 * 100.0) / 100.0)
                .build();
    }

    @Transactional
    public Subscription create(Integer subscriberID, SubscriptionRequest req) {
        Subscription sub = Subscription.builder()
                .subscriberID(subscriberID)
                .categoryID(req.getCategoryID() != null ? req.getCategoryID() : 12)
                .serviceName(req.getServiceName())
                .billingAmount(req.getBillingAmount())
                .billingCycle(req.getBillingCycle() != null ? req.getBillingCycle() : "monthly")
                .billingDate(req.getBillingDate() != null ? LocalDate.parse(req.getBillingDate()) : null)
                .notes(req.getNotes())
                .logoClass(req.getLogoClass())
                .logoText(req.getLogoText())
                .colorTag(req.getColorTag())
                .reminderDays(req.getReminderDays())
                .providerUrl(req.getProviderUrl())
                .autoRenew(req.getAutoRenew() != null ? req.getAutoRenew() : true)
                .build();
        return subscriptionRepo.save(sub);
    }

    @Transactional
    public Subscription update(Integer subscriptionID, Integer subscriberID, SubscriptionRequest req) {
        Subscription sub = subscriptionRepo.findBySubscriptionIDAndSubscriberID(subscriptionID, subscriberID)
                .orElseThrow(() -> new RuntimeException("Subscription not found"));

        if (req.getServiceName() != null) sub.setServiceName(req.getServiceName());
        if (req.getCategoryID() != null) sub.setCategoryID(req.getCategoryID());
        if (req.getBillingAmount() != null) sub.setBillingAmount(req.getBillingAmount());
        if (req.getBillingCycle() != null) sub.setBillingCycle(req.getBillingCycle());
        if (req.getBillingDate() != null) sub.setBillingDate(LocalDate.parse(req.getBillingDate()));
        if (req.getSubStatus() != null) sub.setSubStatus(req.getSubStatus());
        sub.setNotes(req.getNotes());
        sub.setLogoClass(req.getLogoClass());
        sub.setLogoText(req.getLogoText());
        sub.setColorTag(req.getColorTag());
        sub.setReminderDays(req.getReminderDays());
        sub.setProviderUrl(req.getProviderUrl());

        return subscriptionRepo.save(sub);
    }

    @Transactional
    public void delete(Integer subscriptionID, Integer subscriberID) {
        Subscription sub = subscriptionRepo.findBySubscriptionIDAndSubscriberID(subscriptionID, subscriberID)
                .orElseThrow(() -> new RuntimeException("Subscription not found"));
        subscriptionRepo.delete(sub);
    }

    @Transactional
    public Subscription toggle(Integer subscriptionID, Integer subscriberID) {
        Subscription sub = subscriptionRepo.findBySubscriptionIDAndSubscriberID(subscriptionID, subscriberID)
                .orElseThrow(() -> new RuntimeException("Subscription not found"));
        sub.setSubStatus("active".equals(sub.getSubStatus()) ? "paused" : "active");
        return subscriptionRepo.save(sub);
    }
}
