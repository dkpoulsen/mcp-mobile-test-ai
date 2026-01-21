import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

public class JavaLoginTest {
    private WebDriver driver;

    @BeforeMethod
    public void setUp() {
        driver = new ChromeDriver();
        driver.manage().timeouts().implicitlyWait(10, java.util.concurrent.TimeUnit.SECONDS);
    }

    @Test
    public void testValidLogin() {
        // Navigate to login page
        driver.get("https://example.com/login");

        // Enter username
        WebElement usernameField = driver.findElement(By.id("username"));
        usernameField.sendKeys("testuser@example.com");

        // Enter password
        WebElement passwordField = driver.findElement(By.id("password"));
        passwordField.sendKeys("SecurePass123!");

        // Click login button
        WebElement loginButton = driver.findElement(By.id("login-btn"));
        loginButton.click();

        // Verify successful login
        WebElement welcomeMessage = driver.findElement(By.className("welcome"));
        Assert.assertTrue(welcomeMessage.isDisplayed());
        Assert.assertEquals(welcomeMessage.getText(), "Welcome back!");
    }

    @Test
    public void testInvalidCredentials() {
        // Navigate to login page
        driver.get("https://example.com/login");

        // Enter invalid credentials
        driver.findElement(By.id("username")).sendKeys("invalid@example.com");
        driver.findElement(By.id("password")).sendKeys("WrongPassword");

        // Click login button
        driver.findElement(By.id("login-btn")).click();

        // Verify error message
        WebElement errorMessage = driver.findElement(By.className("error"));
        Assert.assertTrue(errorMessage.isDisplayed());
    }

    @AfterMethod
    public void tearDown() {
        if (driver != null) {
            driver.quit();
        }
    }
}
