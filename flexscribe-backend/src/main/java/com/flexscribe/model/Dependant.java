package com.flexscribe.model;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "Dependant")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Dependant {

    @Id
    @Column(name = "dependantID")
    private Integer dependantID;

    @OneToOne
    @MapsId
    @JoinColumn(name = "dependantID")
    private Subscriber subscriber;

    @Column(name = "mainMemberID", nullable = false)
    private Integer mainMemberID;

    @Column(name = "age")
    private Integer age;

    @Column(name = "relationship", length = 100)
    private String relationship;

    @Column(name = "allowance", nullable = false)
    @Builder.Default
    private Double allowance = 0.0;

    @Column(name = "spendingLimit")
    private Double spendingLimit;

    @Column(name = "status", nullable = false, length = 50)
    @Builder.Default
    private String status = "invited";
}
