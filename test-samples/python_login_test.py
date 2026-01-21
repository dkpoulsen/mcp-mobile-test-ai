import unittest
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

class PythonLoginTest(unittest.TestCase):
    def setUp(self):
        self.driver = webdriver.Chrome()
        self.driver.implicitly_wait(10)

    def test_valid_login(self):
        """Test valid user login"""
        # Navigate to login page
        self.driver.get("https://example.com/login")

        # Enter username
        username_field = self.driver.find_element(By.ID, "username")
        username_field.send_keys("testuser@example.com")

        # Enter password
        password_field = self.driver.find_element(By.ID, "password")
        password_field.send_keys("SecurePass123!")

        # Click login button
        login_button = self.driver.find_element(By.ID, "login-btn")
        login_button.click()

        # Verify successful login
        welcome_message = self.driver.find_element(By.CLASS_NAME, "welcome")
        self.assertTrue(welcome_message.is_displayed())
        self.assertEqual(welcome_message.text, "Welcome back!")

    def test_invalid_credentials(self):
        """Test login with invalid credentials"""
        # Navigate to login page
        self.driver.get("https://example.com/login")

        # Enter invalid credentials
        self.driver.find_element(By.ID, "username").send_keys("invalid@example.com")
        self.driver.find_element(By.ID, "password").send_keys("WrongPassword")

        # Click login button
        self.driver.find_element(By.ID, "login-btn").click()

        # Verify error message is shown
        error_message = self.driver.find_element(By.CLASS_NAME, "error")
        self.assertTrue(error_message.is_displayed())

    def tearDown(self):
        if self.driver:
            self.driver.quit()

if __name__ == "__main__":
    unittest.main()
