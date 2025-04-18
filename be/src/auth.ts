import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';

// Use an absolute path to ensure the file is created in a known location
const USER_FILE = path.resolve(__dirname, '..', 'user.txt');

console.log('User file path:', USER_FILE);

// Ensure the user file exists and is writable
try {
  if (!fs.existsSync(USER_FILE)) {
    console.log('Creating user file:', USER_FILE);
    fs.writeFileSync(USER_FILE, '', 'utf8');
    console.log('User file created successfully');
  } else {
    console.log('User file already exists');
    // Test if file is writable
    fs.appendFileSync(USER_FILE, '', 'utf8');
    console.log('User file is writable');
  }
} catch (error) {
  console.error('Error with user file:', error);
}

// Helper function to read users from file
const getUsers = (): Map<string, string> => {
  const users = new Map<string, string>();
  
  try {
    if (fs.existsSync(USER_FILE)) {
      const fileContent = fs.readFileSync(USER_FILE, 'utf8');
      console.log('File content loaded, lines:', fileContent.split('\n').length);
      
      const lines = fileContent.split('\n').filter(line => line.trim());
      
      lines.forEach(line => {
        const [username, password] = line.split(',');
        if (username && password) {
          users.set(username, password);
        }
      });
    }
  } catch (error) {
    console.error('Error reading users file:', error);
  }
  
  return users;
};

// Register a new user
export const registerUser = (req: any, res: any) => {
  console.log('Register request:', req.body);
  const { username, password } = req.body;
  
  if (!username || !password) {
    console.log('Missing username or password');
    return res.status(400).json({
      success: false,
      message: 'Username and password are required'
    });
  }
  
  const users = getUsers();
  
  if (users.has(username)) {
    console.log('Username already exists:', username);
    return res.status(400).json({
      success: false,
      message: 'Username already exists'
    });
  }
  
  try {
    // Add new user
    users.set(username, password);
    
    // Write back to file
    const usersString = Array.from(users.entries())
      .map(([user, pass]) => `${user},${pass}`)
      .join('\n');
    
    console.log('Writing users to file, count:', users.size);
    fs.writeFileSync(USER_FILE, usersString, 'utf8');
    console.log('Users written successfully');
    
    return res.json({
      success: true,
      message: 'User registered successfully'
    });
  } catch (error) {
    console.error('Error registering user:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error registering user'
    });
  }
};

// Login a user
export const loginUser = (req: any, res: any) => {
  console.log('Login request:', req.body);
  const { username, password } = req.body;
  
  if (!username || !password) {
    console.log('Missing username or password');
    return res.status(400).json({
      success: false,
      message: 'Username and password are required'
    });
  }
  
  try {
    const users = getUsers();
    console.log('Users loaded, count:', users.size);
    
    if (!users.has(username)) {
      console.log('Username not found:', username);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    if (users.get(username) !== password) {
      console.log('Invalid password for user:', username);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    console.log('User logged in successfully:', username);
    return res.json({
      success: true,
      message: 'Login successful',
      user: { username }
    });
  } catch (error) {
    console.error('Error logging in user:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error logging in'
    });
  }
}; 