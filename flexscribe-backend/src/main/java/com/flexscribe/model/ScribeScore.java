package com.flexscribe.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "ScribeScore")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ScribeScore {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "scoreID")
    private Integer scoreID;

    @Column(name = "subscriberID", nullable = false)
    private Integer subscriberID;

    @Column(name = "scoreValue", nullable = false)
    @Builder.Default
    private Integer scoreValue = 0;

    @Column(name = "subscriptionPct")
    private Double subscriptionPct;

    @Column(name = "budgetPct")
    private Double budgetPct;

    @Column(name = "savingsPct")
    private Double savingsPct;

    @Column(name = "generatedAt", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime generatedAt = LocalDateTime.now();
}
