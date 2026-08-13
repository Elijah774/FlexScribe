package com.flexscribe.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;

@Entity
@Table(name = "PaymentSchedule")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PaymentSchedule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "scheduleID")
    private Integer scheduleID;

    @Column(name = "subscriptionID", nullable = false)
    private Integer subscriptionID;

    @Column(name = "nextPaymentDate", nullable = false)
    private LocalDate nextPaymentDate;

    @Column(name = "amountDue", nullable = false)
    private Double amountDue;

    @Column(name = "scheduleStatus", nullable = false, length = 50)
    @Builder.Default
    private String scheduleStatus = "pending";
}
