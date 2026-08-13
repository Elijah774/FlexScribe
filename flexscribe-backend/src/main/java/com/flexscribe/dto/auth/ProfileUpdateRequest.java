package com.flexscribe.dto.auth;

import lombok.Data;

@Data
public class ProfileUpdateRequest {
    private String firstName;
    private String lastName;
    private String preferredName;
    private String phone;
    private String avatarUrl;
}
