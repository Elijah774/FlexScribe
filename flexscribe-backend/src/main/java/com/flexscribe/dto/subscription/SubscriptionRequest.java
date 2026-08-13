package com.flexscribe.dto.subscription;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Data;

@Data
public class SubscriptionRequest {

    @NotBlank(message = "Service name is required")
    private String serviceName;

    private Integer categoryID;

    @NotNull(message = "Billing amount is required")
    @Positive(message = "Amount must be greater than zero")
    private Double billingAmount;

    private String billingCycle;
    private String billingDate;
    private String subStatus;
    private String notes;
    private String logoClass;
    private String logoText;
    private String colorTag;
    private Integer reminderDays;
    private String providerUrl;
    private Boolean autoRenew;
}
