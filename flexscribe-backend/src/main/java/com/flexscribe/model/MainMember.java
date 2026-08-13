package com.flexscribe.model;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "MainMember")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class MainMember {

    @Id
    @Column(name = "mainMemberID")
    private Integer mainMemberID;

    @OneToOne
    @MapsId
    @JoinColumn(name = "mainMemberID")
    private Subscriber subscriber;

    @Column(name = "monthlyIncome", precision = 18, scale = 2)
    private Double monthlyIncome;

    @Column(name = "planType", nullable = false, length = 50)
    @Builder.Default
    private String planType = "Free";

    @Column(name = "riskFlagStatus", length = 50)
    private String riskFlagStatus;
}
