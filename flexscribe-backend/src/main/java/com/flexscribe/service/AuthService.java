package com.flexscribe.service;

import com.flexscribe.dto.auth.*;
import com.flexscribe.model.MainMember;
import com.flexscribe.model.Subscriber;
import com.flexscribe.model.VirtualWallet;
import com.flexscribe.repository.MainMemberRepository;
import com.flexscribe.repository.SubscriberRepository;
import com.flexscribe.repository.VirtualWalletRepository;
import com.flexscribe.security.JwtTokenProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    @Autowired private SubscriberRepository subscriberRepo;
    @Autowired private MainMemberRepository mainMemberRepo;
    @Autowired private VirtualWalletRepository walletRepo;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private JwtTokenProvider tokenProvider;

    @Transactional
    public AuthResponse register(RegisterRequest req) {
        if (subscriberRepo.existsByEmail(req.getEmail())) {
            throw new RuntimeException("Email already registered");
        }

        Subscriber subscriber = Subscriber.builder()
                .firstName(req.getFirstName())
                .lastName(req.getLastName())
                .email(req.getEmail())
                .passwordHash(passwordEncoder.encode(req.getPassword()))
                .phone(req.getPhone())
                .marketingOptIn(req.getMarketingOptIn() != null && req.getMarketingOptIn())
                .build();
        subscriber = subscriberRepo.save(subscriber);

        // Create MainMember record
        MainMember mm = MainMember.builder().mainMemberID(subscriber.getSubscriberID()).subscriber(subscriber).build();
        mainMemberRepo.save(mm);

        // Create wallet
        VirtualWallet wallet = VirtualWallet.builder().subscriberID(subscriber.getSubscriberID()).build();
        walletRepo.save(wallet);

        String token = tokenProvider.generateToken(subscriber.getSubscriberID(), subscriber.getEmail(), subscriber.getUserType());

        return AuthResponse.builder()
                .token(token).tokenType("Bearer")
                .subscriberID(subscriber.getSubscriberID())
                .firstName(subscriber.getFirstName()).lastName(subscriber.getLastName())
                .email(subscriber.getEmail()).userType(subscriber.getUserType())
                .build();
    }

    public AuthResponse login(LoginRequest req) {
        Subscriber subscriber = subscriberRepo.findByEmail(req.getEmail())
                .orElseThrow(() -> new RuntimeException("Invalid email or password"));

        if (!passwordEncoder.matches(req.getPassword(), subscriber.getPasswordHash())) {
            throw new RuntimeException("Invalid email or password");
        }

        String token = tokenProvider.generateToken(subscriber.getSubscriberID(), subscriber.getEmail(), subscriber.getUserType());

        return AuthResponse.builder()
                .token(token).tokenType("Bearer")
                .subscriberID(subscriber.getSubscriberID())
                .firstName(subscriber.getFirstName()).lastName(subscriber.getLastName())
                .preferredName(subscriber.getPreferredName())
                .email(subscriber.getEmail()).userType(subscriber.getUserType())
                .avatarUrl(subscriber.getAvatarUrl())
                .build();
    }

    public Subscriber getProfile(Integer subscriberID) {
        return subscriberRepo.findById(subscriberID)
                .orElseThrow(() -> new RuntimeException("User not found"));
    }

    @Transactional
    public Subscriber updateProfile(Integer subscriberID, ProfileUpdateRequest req) {
        Subscriber sub = subscriberRepo.findById(subscriberID)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (req.getFirstName() != null) sub.setFirstName(req.getFirstName());
        if (req.getLastName() != null) sub.setLastName(req.getLastName());
        sub.setPreferredName(req.getPreferredName());
        sub.setPhone(req.getPhone());
        sub.setAvatarUrl(req.getAvatarUrl());

        return subscriberRepo.save(sub);
    }
}
