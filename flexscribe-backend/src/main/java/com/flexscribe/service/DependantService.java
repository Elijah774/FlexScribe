package com.flexscribe.service;

import com.flexscribe.dto.dependant.DependantRequest;
import com.flexscribe.model.Dependant;
import com.flexscribe.model.Subscriber;
import com.flexscribe.repository.DependantRepository;
import com.flexscribe.repository.SubscriberRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class DependantService {

    @Autowired private DependantRepository dependantRepo;
    @Autowired private SubscriberRepository subscriberRepo;
    @Autowired private PasswordEncoder passwordEncoder;

    public List<Dependant> getAllByMainMember(Integer mainMemberID) {
        return dependantRepo.findByMainMemberID(mainMemberID);
    }

    @Transactional
    public Dependant create(Integer mainMemberID, DependantRequest req) {
        if (subscriberRepo.existsByEmail(req.getEmail())) {
            throw new RuntimeException("Email already in use");
        }

        // Create subscriber for dependant
        Subscriber sub = Subscriber.builder()
                .firstName(req.getFirstName())
                .lastName(req.getLastName() != null ? req.getLastName() : "")
                .email(req.getEmail())
                .passwordHash(passwordEncoder.encode("temp_" + System.currentTimeMillis()))
                .userType("Dependant")
                .build();
        sub = subscriberRepo.save(sub);

        // Create dependant record
        Dependant dep = Dependant.builder()
                .dependantID(sub.getSubscriberID())
                .subscriber(sub)
                .mainMemberID(mainMemberID)
                .relationship(req.getRelationship())
                .allowance(req.getAllowance() != null ? req.getAllowance() : 0.0)
                .spendingLimit(req.getSpendingLimit())
                .build();
        return dependantRepo.save(dep);
    }

    @Transactional
    public Dependant update(Integer dependantID, Integer mainMemberID, DependantRequest req) {
        Dependant dep = dependantRepo.findByDependantIDAndMainMemberID(dependantID, mainMemberID)
                .orElseThrow(() -> new RuntimeException("Dependant not found"));

        if (req.getRelationship() != null) dep.setRelationship(req.getRelationship());
        if (req.getAllowance() != null) dep.setAllowance(req.getAllowance());
        dep.setSpendingLimit(req.getSpendingLimit());
        if (req.getStatus() != null) dep.setStatus(req.getStatus());

        return dependantRepo.save(dep);
    }

    @Transactional
    public void delete(Integer dependantID, Integer mainMemberID) {
        Dependant dep = dependantRepo.findByDependantIDAndMainMemberID(dependantID, mainMemberID)
                .orElseThrow(() -> new RuntimeException("Dependant not found"));
        dependantRepo.delete(dep);
    }
}
