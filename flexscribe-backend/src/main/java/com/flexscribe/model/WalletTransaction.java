package com.flexscribe.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "WalletTransaction")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class WalletTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "transactionID")
    private Integer transactionID;

    @Column(name = "walletID", nullable = false)
    private Integer walletID;

    @Column(name = "subscriptionID")
    private Integer subscriptionID;

    @Column(name = "goalID")
    private Integer goalID;

    @Column(name = "dependantID")
    private Integer dependantID;

    @Column(name = "transactionType", nullable = false, length = 50)
    private String transactionType;

    @Column(name = "transactionAmount", nullable = false)
    private Double transactionAmount;

    @Column(name = "runningBalance")
    private Double runningBalance;

    @Column(name = "description", length = 200)
    private String description;

    @Column(name = "category", length = 100)
    private String category;

    @Column(name = "transactionDate", nullable = false)
    @Builder.Default
    private LocalDateTime transactionDate = LocalDateTime.now();
}
