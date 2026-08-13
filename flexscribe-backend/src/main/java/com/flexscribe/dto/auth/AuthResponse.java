package com.flexscribe.dto.auth;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

@Data @Builder @AllArgsConstructor
public class AuthResponse {
    private String token;
    private String tokenType;
    private Integer subscriberID;
    private String firstName;
    private String lastName;
    private String preferredName;
    private String email;
    private String userType;
    private String avatarUrl;
}
