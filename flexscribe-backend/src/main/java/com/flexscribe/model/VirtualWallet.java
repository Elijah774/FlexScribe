package com.flexscribe.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "VirtualWallet")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class VirtualWallet {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "walletID")
    private Integer walletID;

    @Column(name = "subscriberID", nullable = false, unique = true)
    private Integer subscriberID;

    @Column(name = "balance", nullable = false)
    @Builder.Default
    private Double balance = 0.0;

    @Column(name = "pendingIn", nullable = false)
    @Builder.Default
    private Double pendingIn = 0.0;

    @Column(name = "pendingOut", nullable = false)
    @Builder.Default
    private Double pendingOut = 0.0;

    @Column(name = "currency", nullable = false, length = 10)
    @Builder.Default
    private String currency = "ZAR";

    @Column(name = "lastTopUpDate")
    private LocalDateTime lastTopUpDate;

    @Column(name = "createdAt", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
