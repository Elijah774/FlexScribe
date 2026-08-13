package com.flexscribe.security;

import com.flexscribe.model.Subscriber;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * Utility to get the currently authenticated user from SecurityContext.
 */
public class CurrentUser {

    public static Subscriber get() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof Subscriber) {
            return (Subscriber) auth.getPrincipal();
        }
        return null;
    }

    public static Integer getId() {
        Subscriber user = get();
        return user != null ? user.getSubscriberID() : null;
    }
}
