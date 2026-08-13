package com.flexscribe.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "Subscription")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Subscription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "subscriptionID")
    private Integer subscriptionID;

    @Column(name = "subscriberID", nullable = false)
    private Integer subscriberID;

    @Column(name = "categoryID", nullable = false)
    private Integer categoryID;

    @Column(name = "serviceName", nullable = false, length = 200)
    private String serviceName;

    @Column(name = "billingAmount", nullable = false)
    private Double billingAmount;

    @Column(name = "billingCycle", nullable = false, length = 20)
    @Builder.Default
    private String billingCycle = "monthly";

    @Column(name = "billingDate")
    private LocalDate billingDate;

    @Column(name = "subStatus", nullable = false, length = 50)
    @Builder.Default
    private String subStatus = "active";

    @Column(name = "autoRenew", nullable = false)
    @Builder.Default
    private Boolean autoRenew = true;

    @Column(name = "logoClass", length = 50)
    private String logoClass;

    @Column(name = "logoText", length = 10)
    private String logoText;

    @Column(name = "notes", length = 500)
    private String notes;

    @Column(name = "colorTag", length = 7)
    private String colorTag;

    @Column(name = "reminderDays")
    private Integer reminderDays;

    @Column(name = "providerUrl", length = 500)
    private String providerUrl;

    @Column(name = "createdAt", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updatedAt", nullable = false)
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

    // Transient field for category name (joined in queries)
    @Transient
    private String categoryName;

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
