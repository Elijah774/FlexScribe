package com.flexscribe.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * Centralized app properties — extensible for future features.
 * Maps to 'app.*' keys in application.properties.
 */
@Configuration
@ConfigurationProperties(prefix = "app")
@Data
public class AppProperties {

    private Jwt jwt = new Jwt();
    private Cors cors = new Cors();
    private Ai ai = new Ai();
    private FlexTap flexTap = new FlexTap();

    @Data
    public static class Jwt {
        private String secret;
        private long expirationMs = 604800000; // 7 days
    }

    @Data
    public static class Cors {
        private String allowedOrigins;
    }

    /** Future: Scribe AI integration */
    @Data
    public static class Ai {
        private boolean enabled = false;
        private String apiKey;
        private String model = "gpt-4o-mini";
    }

    /** Future: FlexTap NFC/contactless payments */
    @Data
    public static class FlexTap {
        private boolean enabled = false;
        private String merchantId;
    }
}
