package com.flexscribe.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "FinancialGoal")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class FinancialGoal {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "goalID")
    private Integer goalID;

    @Column(name = "subscriberID", nullable = false)
    private Integer subscriberID;

    @Column(name = "goalName", nullable = false, length = 200)
    private String goalName;

    @Column(name = "targetAmount", nullable = false)
    private Double targetAmount;

    @Column(name = "currentProgress", nullable = false)
    @Builder.Default
    private Double currentProgress = 0.0;

    @Column(name = "deadline")
    private LocalDate deadline;

    @Column(name = "imageUrl", length = 500)
    private String imageUrl;

    @Column(name = "goalStatus", nullable = false, length = 50)
    @Builder.Default
    private String goalStatus = "active";

    @Column(name = "lastTopUpDate")
    private LocalDateTime lastTopUpDate;

    @Column(name = "createdAt", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
