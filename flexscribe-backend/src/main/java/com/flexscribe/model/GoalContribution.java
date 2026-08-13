package com.flexscribe.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "GoalContribution")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class GoalContribution {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "contributionID")
    private Integer contributionID;

    @Column(name = "goalID", nullable = false)
    private Integer goalID;

    @Column(name = "amountCents", nullable = false)
    private Integer amountCents;

    @Column(name = "source", nullable = false, length = 50)
    @Builder.Default
    private String source = "wallet";

    @Column(name = "createdAt", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
